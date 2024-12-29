// models/Ship.js
const mongoose = require('mongoose');

const shipSchema = new mongoose.Schema({
    // 기본 정보
    name: { 
        type: String, 
        required: true,
        unique: true,
        trim: true
    },
    
    // 예약 존재 여부
    hasReservations: { 
        type: Boolean, 
        default: false 
    },
    
    // 포항출항 좌석 구성
    departureSeats: {
        economy: {
            type: Number,
            default: 0,
            min: 0
        },
        business: {
            type: Number,
            default: 0,
            min: 0
        },
        first: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    
    // 울릉출항 좌석 구성
    arrivalSeats: {
        economy: {
            type: Number,
            default: 0,
            min: 0
        },
        business: {
            type: Number,
            default: 0,
            min: 0
        },
        first: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    
    // 활성화 상태
    isActive: {
        type: Boolean,
        default: true
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// 가상 필드: 총 좌석 수 (출항)
shipSchema.virtual('departureTotalSeats').get(function() {
    return this.departureSeats.economy + 
           this.departureSeats.business + 
           this.departureSeats.first;
});

// 가상 필드: 총 좌석 수 (입항)
shipSchema.virtual('arrivalTotalSeats').get(function() {
    return this.arrivalSeats.economy + 
           this.arrivalSeats.business + 
           this.arrivalSeats.first;
});

// 선박 삭제 전 예약 확인
shipSchema.pre('remove', async function(next) {
    try {
        const Booking = mongoose.model('Booking');
        const hasBookings = await Booking.exists({ ship: this._id });
        
        if (hasBookings) {
            throw new Error('예약이 존재하는 선박은 삭제할 수 없습니다.');
        }
        
        next();
    } catch (error) {
        next(error);
    }
});

// 예약 가능 여부 확인 메서드
shipSchema.methods.checkAvailability = async function(date, type, seatClass, count) {
    try {
        const SeatStatus = mongoose.model('SeatStatus');
        const status = await SeatStatus.findOne({
            ship: this._id,
            date: date,
            type: type // 'departure' 또는 'arrival'
        });

        if (!status) return true; // 상태 정보가 없으면 예약 가능

        const maxSeats = type === 'departure' 
            ? this.departureSeats[seatClass]
            : this.arrivalSeats[seatClass];

        const reserved = status[`${seatClass}Reserved`] || 0;
        const blocked = status[`${seatClass}Blocked`] || 0;
        
        return (maxSeats - (reserved + blocked + count)) >= 0;
    } catch (error) {
        throw new Error('좌석 가용성 확인 중 오류가 발생했습니다.');
    }
};

// 좌석 정보 업데이트 메서드
shipSchema.methods.updateSeats = async function(seatData) {
    try {
        if (seatData.departure) {
            this.departureSeats = {
                ...this.departureSeats,
                ...seatData.departure
            };
        }
        
        if (seatData.arrival) {
            this.arrivalSeats = {
                ...this.arrivalSeats,
                ...seatData.arrival
            };
        }
        
        return await this.save();
    } catch (error) {
        throw new Error('좌석 정보 업데이트 중 오류가 발생했습니다.');
    }
};

// 좌석 가용성 체크를 위한 정적 메서드
shipSchema.statics.getAvailableSeats = async function(date, type) {
    try {
        const ships = await this.find({ isActive: true });
        const SeatStatus = mongoose.model('SeatStatus');
        
        const results = await Promise.all(ships.map(async (ship) => {
            const status = await SeatStatus.findOne({
                ship: ship._id,
                date: date,
                type: type
            });

            const seatInfo = type === 'departure' ? ship.departureSeats : ship.arrivalSeats;
            const available = {
                economy: seatInfo.economy,
                business: seatInfo.business,
                first: seatInfo.first
            };

            if (status) {
                available.economy -= (status.economyReserved + status.economyBlocked);
                available.business -= (status.businessReserved + status.businessBlocked);
                available.first -= (status.firstReserved + status.firstBlocked);
            }

            return {
                ship: ship,
                availableSeats: available
            };
        }));

        return results;
    } catch (error) {
        throw new Error('좌석 가용성 조회 중 오류가 발생했습니다.');
    }
};

module.exports = mongoose.model('Ship', shipSchema);