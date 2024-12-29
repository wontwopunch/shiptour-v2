// routes/status.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateUser } = require('./auth');
const Ship = require('../models/Ship');
const Booking = require('../models/Booking');
const SeatStatus = require('../models/SeatStatus');

router.get('/', authenticateUser, async (req, res) => {
    try {
        const { shipId, month } = req.query;
        let query = {};

        // 필터 조건 설정
        if (shipId) {
            query.ship = shipId;
        }
        if (month) {
            const startDate = new Date(month);
            const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
            query.date = {
                $gte: startDate,
                $lte: endDate
            };
        }

        // 선박 목록 조회
        const ships = await Ship.find().sort({ name: 1 });

        // 예약 데이터 조회
        const bookings = await Booking.find({
            ...(query.ship && { ship: query.ship }),
            ...(query.date && {
                $or: [
                    { departureDate: query.date },
                    { arrivalDate: query.date }
                ]
            })
        }).populate('ship');

        // 필요한 모든 날짜 수집 (예약이 있는 날짜)
        const requiredDates = new Set();
        bookings.forEach(booking => {
            if (booking.economySeats > 0 || booking.businessSeats > 0 || booking.firstSeats > 0) {
                requiredDates.add(booking.departureDate.toISOString().split('T')[0]);
                requiredDates.add(booking.arrivalDate.toISOString().split('T')[0]);
            }
        });

        // Status 조회 (저장된 블럭 정보 포함)
        let statuses = await SeatStatus.find({
            ...(query.ship && { ship: query.ship }),
            date: { 
                $in: Array.from(requiredDates).map(date => new Date(date)) 
            }
        }).populate('ship');

        // 누락된 Status 생성
        for (const dateStr of requiredDates) {
            const date = new Date(dateStr);
            const hasStatus = statuses.some(s => 
                s.date.toISOString().split('T')[0] === dateStr &&
                (!query.ship || s.ship._id.toString() === query.ship)
            );

            if (!hasStatus) {
                for (const ship of ships) {
                    if (!query.ship || ship._id.toString() === query.ship) {
                        const newStatus = await SeatStatus.create({
                            ship: ship._id,
                            date,
                            departure: {
                                economyReserved: 0,
                                businessReserved: 0,
                                firstReserved: 0,
                                economyBlocked: 0,
                                businessBlocked: 0,
                                firstBlocked: 0
                            },
                            arrival: {
                                economyReserved: 0,
                                businessReserved: 0,
                                firstReserved: 0,
                                economyBlocked: 0,
                                businessBlocked: 0,
                                firstBlocked: 0
                            }
                        });
                        const populatedStatus = await newStatus.populate('ship');
                        statuses.push(populatedStatus);
                    }
                }
            }
        }

        // 정렬
        statuses.sort((a, b) => {
            const dateCompare = a.date - b.date;
            if (dateCompare === 0) {
                return a.ship.name.localeCompare(b.ship.name);
            }
            return dateCompare;
        });

        // 실시간 예약 정보로 업데이트
        const updatedStatuses = await updateRealTimeStatus(statuses);

        // 예약이 있는 상태만 필터링
        const filteredStatuses = updatedStatuses.filter(status => 
            status.departure.economyReserved > 0 || 
            status.departure.businessReserved > 0 || 
            status.departure.firstReserved > 0 ||
            status.arrival.economyReserved > 0 || 
            status.arrival.businessReserved > 0 || 
            status.arrival.firstReserved > 0 ||
            status.departure.economyBlocked > 0 ||
            status.departure.businessBlocked > 0 ||
            status.departure.firstBlocked > 0 ||
            status.arrival.economyBlocked > 0 ||
            status.arrival.businessBlocked > 0 ||
            status.arrival.firstBlocked > 0
        );

        res.render('status', {
            statuses: filteredStatuses,
            ships,
            filters: { shipId, month }
        });

    } catch (error) {
        console.error('좌석 현황 조회 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '좌석 현황을 불러오는 중 오류가 발생했습니다.'
        });
    }
});


router.post('/batch-save', authenticateUser, async (req, res) => {
    try {
        const data = req.body;
        console.log('Received data:', data);

        if (!data || !data.statusId) {
            throw new Error('올바르지 않은 데이터 형식입니다.');
        }

        // Status 찾기
        const status = await SeatStatus.findById(data.statusId);
        if (!status) {
            throw new Error('상태를 찾을 수 없습니다.');
        }

        // 출발 블록 좌석 업데이트
        if (data.departure) {
            status.departure = {
                ...status.departure,
                economyBlocked: parseInt(data.departure.economyBlocked) || 0,
                businessBlocked: parseInt(data.departure.businessBlocked) || 0,
                firstBlocked: parseInt(data.departure.firstBlocked) || 0
            };
        }

        // 도착 블록 좌석 업데이트
        if (data.arrival) {
            status.arrival = {
                ...status.arrival,
                economyBlocked: parseInt(data.arrival.economyBlocked) || 0,
                businessBlocked: parseInt(data.arrival.businessBlocked) || 0,
                firstBlocked: parseInt(data.arrival.firstBlocked) || 0
            };
        }

        // 변경 사항 저장
        await status.save();

        // 업데이트된 상태로 다시 조회
        const updatedStatus = await SeatStatus.findById(data.statusId).populate('ship');
        const statusWithReservations = await updateRealTimeStatus([updatedStatus]);

        // 응답
        res.json({
            success: true,
            message: '좌석 상태가 업데이트되었습니다.',
            status: statusWithReservations[0],
            // 잔여석 계산 결과 포함
            remainingSeats: {
                departure: {
                    economy: statusWithReservations[0].departure.economyBlocked - statusWithReservations[0].departure.economyReserved,
                    business: statusWithReservations[0].departure.businessBlocked - statusWithReservations[0].departure.businessReserved,
                    first: statusWithReservations[0].departure.firstBlocked - statusWithReservations[0].departure.firstReserved
                },
                arrival: {
                    economy: statusWithReservations[0].arrival.economyBlocked - statusWithReservations[0].arrival.economyReserved,
                    business: statusWithReservations[0].arrival.businessBlocked - statusWithReservations[0].arrival.businessReserved,
                    first: statusWithReservations[0].arrival.firstBlocked - statusWithReservations[0].arrival.firstReserved
                }
            }
        });

    } catch (error) {
        console.error('좌석 상태 업데이트 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '좌석 상태 업데이트 중 오류가 발생했습니다.'
        });
    }
});


// 블럭 좌석 수정
router.post('/save', authenticateUser, async (req, res) => {
    try {
        const updates = req.body;
        const { statusId, departure, arrival } = updates;

        const status = await SeatStatus.findById(statusId);
        if (!status) {
            return res.status(404).json({
                success: false,
                message: '해당 데이터를 찾을 수 없습니다.'
            });
        }

        // 출발 좌석 업데이트
        status.departure.economyBlocked = departure.economyBlocked;
        status.departure.businessBlocked = departure.businessBlocked;
        status.departure.firstBlocked = departure.firstBlocked;

        // 도착 좌석 업데이트
        status.arrival.economyBlocked = arrival.economyBlocked;
        status.arrival.businessBlocked = arrival.businessBlocked;
        status.arrival.firstBlocked = arrival.firstBlocked;

        await status.save();

        res.json({
            success: true,
            message: '좌석 현황이 업데이트되었습니다.'
        });
    } catch (error) {
        console.error('좌석 현황 업데이트 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '좌석 현황 업데이트 중 오류가 발생했습니다.'
        });
    }
});

// 새로운 날짜 좌석 현황 생성
router.post('/', authenticateUser, async (req, res) => {
    try {
        const statusData = req.body;
        const ship = await Ship.findById(statusData.ship);
        
        if (!ship) {
            return res.status(404).json({
                success: false,
                message: '선박을 찾을 수 없습니다.'
            });
        }

        const newStatus = new SeatStatus(statusData);
        await newStatus.save();

        // 실시간 상태로 업데이트
        const updatedStatus = (await updateRealTimeStatus([newStatus], {}))[0];

        res.status(201).json({
            success: true,
            message: '좌석 상태가 생성되었습니다.',
            status: updatedStatus
        });
    } catch (error) {
        console.error('좌석 상태 생성 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '좌석 상태 생성 중 오류가 발생했습니다.'
        });
    }
});

// 엑셀 다운로드용 데이터 조회
// 엑셀 다운로드용 데이터 조회
router.get('/excel', authenticateUser, async (req, res) => {
    try {
        const { shipId, month } = req.query;
        let query = {};

        // 필터 조건 설정
        if (shipId) {
            query.ship = shipId;
        }
        if (month) {
            const startDate = new Date(month);
            const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
            query.date = {
                $gte: startDate,
                $lte: endDate
            };
        }

        // 좌석 현황 데이터 조회
        const statuses = await SeatStatus.find(query)
            .populate('ship')
            .sort({ date: 1, 'ship.name': 1 });

        // 실시간 데이터로 업데이트
        const updatedStatuses = await updateRealTimeStatus(statuses);

        // 엑셀용 데이터 포맷
        const excelData = updatedStatuses.map(status => ({
            선박명: status.ship.name,
            날짜: new Date(status.date).toLocaleDateString(),
            // 포항출항 예약
            '포항출항_예약_이코노미': status.departure.economyReserved,
            '포항출항_예약_비즈니스': status.departure.businessReserved,
            '포항출항_예약_퍼스트': status.departure.firstReserved,
            // 포항출항 블럭
            '포항출항_블럭_이코노미': status.departure.economyBlocked,
            '포항출항_블럭_비즈니스': status.departure.businessBlocked,
            '포항출항_블럭_퍼스트': status.departure.firstBlocked,
            // 포항출항 잔여
            '포항출항_잔여_이코노미': status.departure.remainingSeats.economy,
            '포항출항_잔여_비즈니스': status.departure.remainingSeats.business,
            '포항출항_잔여_퍼스트': status.departure.remainingSeats.first,
            // 울릉출항 예약
            '울릉출항_예약_이코노미': status.arrival.economyReserved,
            '울릉출항_예약_비즈니스': status.arrival.businessReserved,
            '울릉출항_예약_퍼스트': status.arrival.firstReserved,
            // 울릉출항 블럭
            '울릉출항_블럭_이코노미': status.arrival.economyBlocked,
            '울릉출항_블럭_비즈니스': status.arrival.businessBlocked,
            '울릉출항_블럭_퍼스트': status.arrival.firstBlocked,
            // 울릉출항 잔여
            '울릉출항_잔여_이코노미': status.arrival.remainingSeats.economy,
            '울릉출항_잔여_비즈니스': status.arrival.remainingSeats.business,
            '울릉출항_잔여_퍼스트': status.arrival.remainingSeats.first
        }));

        res.json(excelData);

    } catch (error) {
        console.error('엑셀 데이터 조회 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '데이터 조회 중 오류가 발생했습니다.'
        });
    }
});

async function updateRealTimeStatus(statuses, query) {
    try {
        // 모든 관련 예약 조회
        const bookings = await Booking.find({
            $or: [
                { departureDate: { $in: statuses.map(s => s.date) } },
                { arrivalDate: { $in: statuses.map(s => s.date) } }
            ],
            ship: { $in: statuses.map(s => s.ship._id || s.ship) }
        });

        // 예약 정보 매핑
        const reservedSeatsMap = {};
        
        bookings.forEach(booking => {
            // 출발 예약
            const departureKey = `${booking.ship._id}_${booking.departureDate.toISOString().split('T')[0]}`;
            if (!reservedSeatsMap[departureKey]) {
                reservedSeatsMap[departureKey] = {
                    departure: {
                        economyReserved: 0,
                        businessReserved: 0,
                        firstReserved: 0
                    },
                    arrival: {
                        economyReserved: 0,
                        businessReserved: 0,
                        firstReserved: 0
                    }
                };
            }
            // 예약 좌석 수 누적
            reservedSeatsMap[departureKey].departure.economyReserved += booking.economySeats || 0;
            reservedSeatsMap[departureKey].departure.businessReserved += booking.businessSeats || 0;
            reservedSeatsMap[departureKey].departure.firstReserved += booking.firstSeats || 0;

            // 도착 예약
            const arrivalKey = `${booking.ship._id}_${booking.arrivalDate.toISOString().split('T')[0]}`;
            if (!reservedSeatsMap[arrivalKey]) {
                reservedSeatsMap[arrivalKey] = {
                    departure: {
                        economyReserved: 0,
                        businessReserved: 0,
                        firstReserved: 0
                    },
                    arrival: {
                        economyReserved: 0,
                        businessReserved: 0,
                        firstReserved: 0
                    }
                };
            }
            reservedSeatsMap[arrivalKey].arrival.economyReserved += booking.economySeats || 0;
            reservedSeatsMap[arrivalKey].arrival.businessReserved += booking.businessSeats || 0;
            reservedSeatsMap[arrivalKey].arrival.firstReserved += booking.firstSeats || 0;
        });

        return statuses.map(status => {
            const statusObj = status.toObject ? status.toObject() : status;
            const dateStr = status.date.toISOString().split('T')[0];
            const key = `${status.ship._id}_${dateStr}`;
            const reserved = reservedSeatsMap[key] || {
                departure: { economyReserved: 0, businessReserved: 0, firstReserved: 0 },
                arrival: { economyReserved: 0, businessReserved: 0, firstReserved: 0 }
            };

            return {
                ...statusObj,
                departure: {
                    ...statusObj.departure,
                    economyReserved: reserved.departure.economyReserved,
                    businessReserved: reserved.departure.businessReserved,
                    firstReserved: reserved.departure.firstReserved,
                    // 기존 blocked 값 유지
                    economyBlocked: statusObj.departure.economyBlocked,
                    businessBlocked: statusObj.departure.businessBlocked,
                    firstBlocked: statusObj.departure.firstBlocked,
                    remainingSeats: {
                        economy: statusObj.departure.economyBlocked - reserved.departure.economyReserved,
                        business: statusObj.departure.businessBlocked - reserved.departure.businessReserved,
                        first: statusObj.departure.firstBlocked - reserved.departure.firstReserved
                    }
                },
                arrival: {
                    ...statusObj.arrival,
                    economyReserved: reserved.arrival.economyReserved,
                    businessReserved: reserved.arrival.businessReserved,
                    firstReserved: reserved.arrival.firstReserved,
                    // 기존 blocked 값 유지
                    economyBlocked: statusObj.arrival.economyBlocked,
                    businessBlocked: statusObj.arrival.businessBlocked,
                    firstBlocked: statusObj.arrival.firstBlocked,
                    remainingSeats: {
                        economy: statusObj.arrival.economyBlocked - reserved.arrival.economyReserved,
                        business: statusObj.arrival.businessBlocked - reserved.arrival.businessReserved,
                        first: statusObj.arrival.firstBlocked - reserved.arrival.firstReserved
                    }
                }
            };
        });

    } catch (error) {
        console.error('실시간 상태 업데이트 중 에러:', error);
        throw error;
    }
}

// 헬퍼 함수: 예약된 좌석 수 계산
function calculateSeatCounts(bookings) {
    const seatCounts = {};

    bookings.forEach(booking => {
        const departureKey = `${booking.ship._id}_${booking.departureDate}`;
        const arrivalKey = `${booking.ship._id}_${booking.arrivalDate}`;

        // 출발 좌석 카운트
        if (!seatCounts[departureKey]) {
            seatCounts[departureKey] = {
                economyReserved: 0,
                businessReserved: 0,
                firstReserved: 0
            };
        }
        seatCounts[departureKey].economyReserved += booking.economySeats;
        seatCounts[departureKey].businessReserved += booking.businessSeats;
        seatCounts[departureKey].firstReserved += booking.firstSeats;

        // 도착 좌석 카운트
        if (!seatCounts[arrivalKey]) {
            seatCounts[arrivalKey] = {
                economyReserved: 0,
                businessReserved: 0,
                firstReserved: 0
            };
        }
        seatCounts[arrivalKey].economyReserved += booking.economySeats;
        seatCounts[arrivalKey].businessReserved += booking.businessSeats;
        seatCounts[arrivalKey].firstReserved += booking.firstSeats;
    });

    return seatCounts;
}

// 헬퍼 함수: 현황 데이터와 예약 데이터 병합
function mergeStatusData(statuses, seatCounts) {
    return statuses.map(status => {
        const key = `${status.ship._id}_${status.date}`;
        const counts = seatCounts[key] || {
            economyReserved: 0,
            businessReserved: 0,
            firstReserved: 0
        };

        return {
            ...status.toObject(),
            departure: {
                ...status.departure,
                economyReserved: counts.economyReserved,
                businessReserved: counts.businessReserved,
                firstReserved: counts.firstReserved
            },
            arrival: {
                ...status.arrival,
                economyReserved: counts.economyReserved,
                businessReserved: counts.businessReserved,
                firstReserved: counts.firstReserved
            }
        };
    });
}

// 에러 처리 미들웨어
router.use((err, req, res, next) => {
    console.error('좌석 현황 관리 중 에러 발생:', err);
    res.status(500).json({
        success: false,
        message: '요청을 처리하는 중 오류가 발생했습니다.'
    });
});

module.exports = router;