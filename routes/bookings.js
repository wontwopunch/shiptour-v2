// routes/bookings.js
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./auth');
const Booking = require('../models/Booking');
const Ship = require('../models/Ship');
const mongoose = require('mongoose');

// 예약 목록 조회
router.get('/', authenticateUser, async (req, res) => {
    try {
        const { shipId, month, bookerName } = req.query;
        let query = {};

        // 필터 조건 설정
        if (shipId) {
            query.ship = shipId;
        }
        if (month) {
            const startDate = new Date(month);
            const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
            query.departureDate = {
                $gte: startDate,
                $lte: endDate
            };
        }
        if (bookerName) {
            query.reservedBy = { $regex: bookerName, $options: 'i' };
        }

        // 데이터 조회 및 정렬
        const bookings = await Booking.find(query)
            .populate('ship')
            .sort({ departureDate: 1, arrivalDate: 1 });

        const ships = await Ship.find().sort({ name: 1 });

        // 총 수익 계산
        const totalProfit = bookings.reduce((sum, booking) => sum + booking.profit, 0);

        res.render('bookings', {
            bookings,
            ships,
            totalProfit,
            filters: { shipId, month, bookerName }
        });
    } catch (error) {
        console.error('예약 목록 조회 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '예약 목록을 불러오는 중 오류가 발생했습니다.'
        });
    }
});

// 일괄 저장 처리
// 일괄 저장 처리
router.post('/batch-save', authenticateUser, async (req, res) => {
    try {
        const { bookings } = req.body;
        const results = [];

        // 트랜잭션 대신 Promise.all 사용
        await Promise.all(bookings.map(async (bookingData) => {
            const { _id, ...updateData } = bookingData;

            let savedBooking;
            if (_id && !_id.startsWith('temp_')) {
                // 기존 예약 수정
                savedBooking = await Booking.findByIdAndUpdate(
                    _id,
                    updateData,
                    { new: true }
                );
            } else {
                // 새 예약 생성
                const newBooking = new Booking(updateData);
                savedBooking = await newBooking.save();

                // 선박의 예약 상태 업데이트
                if (updateData.ship) {
                    await Ship.findByIdAndUpdate(updateData.ship, { 
                        hasReservations: true 
                    });
                }
            }
            
            if (savedBooking) {
                results.push(savedBooking);
            }
        }));

        res.json({
            success: true,
            message: '예약이 일괄 저장되었습니다.',
            bookings: results
        });
    } catch (error) {
        console.error('일괄 저장 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '일괄 저장 중 오류가 발생했습니다.'
        });
    }
});

// 단일 예약 저장
router.post('/', authenticateUser, async (req, res) => {
    try {
        const bookingData = req.body;
        const newBooking = new Booking(bookingData);
        await newBooking.save();

        // 선박의 예약 상태 업데이트
        await Ship.findByIdAndUpdate(bookingData.ship, { hasReservations: true });

        res.json({
            success: true,
            message: '예약이 저장되었습니다.',
            booking: newBooking
        });
    } catch (error) {
        console.error('예약 저장 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '예약 저장 중 오류가 발생했습니다.'
        });
    }
});

// 하이라이트 상태 토글
router.post('/:id/highlight', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { field } = req.body;

        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: '예약을 찾을 수 없습니다.'
            });
        }

        const highlighted = await booking.toggleHighlight(field);

        res.json({
            success: true,
            message: '하이라이트 상태가 변경되었습니다.',
            field,
            highlighted
        });
    } catch (error) {
        console.error('하이라이트 상태 변경 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '하이라이트 상태 변경 중 오류가 발생했습니다.'
        });
    }
});

// 하이라이트 상태 일괄 저장
router.post('/batch-highlight', authenticateUser, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { highlights } = req.body;
        const results = [];

        for (const { bookingId, fields } of highlights) {
            const booking = await Booking.findById(bookingId).session(session);
            if (booking) {
                for (const [field, value] of Object.entries(fields)) {
                    booking.highlights[field] = value;
                }
                await booking.save();
                results.push(booking);
            }
        }

        await session.commitTransaction();
        res.json({
            success: true,
            message: '하이라이트 상태가 일괄 저장되었습니다.',
            bookings: results
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('하이라이트 일괄 저장 중 에러:', error);
        res.status(500).json({
            success: false,
            message: '하이라이트 상태 일괄 저장 중 오류가 발생했습니다.'
        });
    } finally {
        session.endSession();
    }
});

// 예약 삭제 라우트
router.delete('/:id', authenticateUser, async (req, res) => {
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const { id } = req.params;

        // MongoDB ID 유효성 검사
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: '유효하지 않은 예약 ID입니다.'
            });
        }

        // 예약 조회 시 세션 사용
        const booking = await Booking.findById(id).session(session);

        if (!booking) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: '예약을 찾을 수 없습니다.'
            });
        }

        // 예약 삭제
        await Booking.findByIdAndDelete(id).session(session);

        // 해당 선박의 다른 예약이 있는지 확인
        const otherBookingsCount = await Booking.countDocuments({
            ship: booking.ship,
            _id: { $ne: id }
        }).session(session);

        // 다른 예약이 없으면 선박의 예약 상태 업데이트
        if (otherBookingsCount === 0 && booking.ship) {
            await Ship.findByIdAndUpdate(
                booking.ship,
                { hasReservations: false },
                { session }
            );
        }

        await session.commitTransaction();
        
        res.json({
            success: true,
            message: '예약이 성공적으로 삭제되었습니다.'
        });

    } catch (error) {
        if (session) {
            await session.abortTransaction();
        }
        console.error('예약 삭제 중 오류:', error);
        res.status(500).json({
            success: false,
            message: '예약 삭제 중 오류가 발생했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (session) {
            session.endSession();
        }
    }
});

// 엑셀 데이터 조회
router.get('/excel', authenticateUser, async (req, res) => {
    try {
        const { shipId, month, bookerName } = req.query;
        let query = {};

        // 필터 조건 적용
        if (shipId) query.ship = shipId;
        if (month) {
            const startDate = new Date(month);
            const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
            query.departureDate = { $gte: startDate, $lte: endDate };
        }
        if (bookerName) query.reservedBy = { $regex: bookerName, $options: 'i' };

        const bookings = await Booking.find(query)
            .populate('ship')
            .sort({ departureDate: 1, arrivalDate: 1 });

        // 엑셀 데이터 형식 변환
        const excelData = bookings.map(booking => ({
            선박명: booking.ship?.name || '',
            명단: booking.listStatus,
            계약일: booking.contractDate,
            출항일: booking.departureDate,
            입항일: booking.arrivalDate,
            예약자명: booking.reservedBy,
            예약자명2: booking.reservedBy2,
            연락처: booking.contact,
            상품: booking.product,
            총좌석: booking.totalSeats,
            이코노미: booking.economySeats,
            비즈니스: booking.businessSeats,
            퍼스트: booking.firstSeats,
            독도관광날짜: booking.dokdoTourDate,
            독도관광인원: booking.dokdoTourPeople,
            독도관광시간: booking.dokdoTourTime,
            상품내용: booking.dokdoTourDetails,
            총금액: booking.totalPrice,
            계약금: booking.deposit,
            잔금: booking.balance,
            렌터카: booking.rentalCar,
            숙박: booking.accommodation,
            기타: booking.others,
            출항비: booking.departureFee,
            입항비: booking.arrivalFee,
            독도비: booking.dokdoFee,
            식당비: booking.restaurantFee,
            행사비: booking.eventFee,
            기타비: booking.otherFee,
            환불: booking.refund,
            총정산비: booking.totalSettlement,
            수익: booking.profit
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

// 에러 처리 미들웨어
router.use((err, req, res, next) => {
    console.error('예약 관리 중 에러 발생:', err);
    res.status(500).json({
        success: false,
        message: '요청을 처리하는 중 오류가 발생했습니다.'
    });
 });
 
 module.exports = router;