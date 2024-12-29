// models/SeatStatus.js
const mongoose = require('mongoose');

// 좌석 정보 서브 스키마
const seatInfoSchema = new mongoose.Schema({
    // 예약된 좌석
    economyReserved: {
        type: Number,
        default: 0,
        min: 0
    },
    businessReserved: {
        type: Number,
        default: 0,
        min: 0
    },
    firstReserved: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // 블록된 좌석
    economyBlocked: {
        type: Number,
        default: 0,
        min: 0
    },
    businessBlocked: {
        type: Number,
        default: 0,
        min: 0
    },
    firstBlocked: {
        type: Number,
        default: 0,
        min: 0
    }
}, { _id: false });

// 메인 스키마
const seatStatusSchema = new mongoose.Schema({
    ship: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ship',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    // 출발 좌석 현황
    departure: seatInfoSchema,
    // 도착 좌석 현황
    arrival: seatInfoSchema
}, {
    timestamps: true
});

// 복합 인덱스 설정
seatStatusSchema.index({ ship: 1, date: 1 }, { unique: true });

// 정적 메서드: 좌석 상태 업데이트
seatStatusSchema.statics.updateSeatStatus = async function(shipId, date, type, seats) {
    try {
        const formattedDate = new Date(date);
        formattedDate.setHours(0, 0, 0, 0);

        let status = await this.findOne({
            ship: shipId,
            date: formattedDate
        });

        if (!status) {
            status = new this({
                ship: shipId,
                date: formattedDate,
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
        }

        // 예약 좌석 수 업데이트
        if (type === 'departure' || type === 'arrival') {
            status[type].economyReserved = (status[type].economyReserved || 0) + (seats.economy || 0);
            status[type].businessReserved = (status[type].businessReserved || 0) + (seats.business || 0);
            status[type].firstReserved = (status[type].firstReserved || 0) + (seats.first || 0);
        }

        await status.save();
        return status;
    } catch (error) {
        console.error('좌석 상태 업데이트 중 오류:', error);
        throw error;
    }
};

// 정적 메서드: 블록 좌석 업데이트
seatStatusSchema.statics.updateBlockedSeats = async function(shipId, date, type, blockedSeats) {
    try {
        const formattedDate = new Date(date);
        formattedDate.setHours(0, 0, 0, 0);

        const filter = { ship: shipId, date: formattedDate };
        const update = {
            $set: {}
        };

        ['economy', 'business', 'first'].forEach(seatClass => {
            if (typeof blockedSeats[seatClass] === 'number') {
                update.$set[`${type}.${seatClass}Blocked`] = Math.max(0, blockedSeats[seatClass]);
            }
        });

        const options = { upsert: true, new: true };
        const status = await this.findOneAndUpdate(filter, update, options);
        return status;
    } catch (error) {
        console.error('블록 좌석 업데이트 중 오류:', error);
        throw error;
    }
};

// 정적 메서드: 날짜 범위로 좌석 현황 조회
seatStatusSchema.statics.getStatusByDateRange = async function(shipId, startDate, endDate) {
    try {
        const status = await this.find({
            ship: shipId,
            date: {
                $gte: startDate,
                $lte: endDate
            }
        })
        .populate('ship')
        .sort({ date: 1 });

        return status;
    } catch (error) {
        console.error('좌석 현황 조회 중 오류:', error);
        throw error;
    }
};

// 정적 메서드: 특정 날짜의 좌석 가용성 확인
seatStatusSchema.statics.checkAvailability = async function(shipId, date, type, seatClass, count) {
    try {
        const ship = await mongoose.model('Ship').findById(shipId);
        if (!ship) return false;

        const status = await this.findOne({ 
            ship: shipId, 
            date: new Date(date) 
        });

        const maxSeats = type === 'departure' 
            ? ship.departureSeats[seatClass] 
            : ship.arrivalSeats[seatClass];

        if (!status) return count <= maxSeats;

        const reserved = status[type][`${seatClass}Reserved`] || 0;
        const blocked = status[type][`${seatClass}Blocked`] || 0;
        
        return (maxSeats - (reserved + blocked + count)) >= 0;
    } catch (error) {
        console.error('좌석 가용성 확인 중 오류:', error);
        throw error;
    }
};

module.exports = mongoose.model('SeatStatus', seatStatusSchema);