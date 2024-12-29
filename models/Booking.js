// models/Booking.js
const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    // 선박 정보
    ship: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ship'
    },

    // 기본 정보
    listStatus: {
        type: String,
        trim: true,
        default: ''
    },
    contractDate: {
        type: Date,
        default: Date.now
    },
    departureDate: {
        type: Date,
        default: Date.now
    },
    arrivalDate: {
        type: Date,
        default: Date.now
    },
    reservedBy: {
        type: String,
        trim: true,
        default: ''
    },
    reservedBy2: {
        type: String,
        trim: true,
        default: ''
    },
    contact: {
        type: String,
        trim: true,
        default: ''
    },
    product: {
        type: String,
        trim: true,
        default: ''
    },

    // 좌석 정보
    totalSeats: {
        type: Number,
        default: 0
    },
    economySeats: {
        type: Number,
        default: 0
    },
    businessSeats: {
        type: Number,
        default: 0
    },
    firstSeats: {
        type: Number,
        default: 0
    },

    // 독도 관광
    dokdoTourDate: {
        type: Date
    },
    dokdoTourPeople: {
        type: Number,
        default: 0
    },
    dokdoTourTime: {
        type: String,
        default: ''
    },
    dokdoTourDetails: {
        type: String,
        default: ''
    },

    // 금액 관리
    totalPrice: {
        type: Number,
        default: 0
    },
    deposit: {
        type: Number,
        default: 0
    },
    balance: {
        type: Number,
        default: 0
    },

    // 예약 관리
    rentalCar: {
        type: String,
        default: ''
    },
    accommodation: {
        type: String,
        default: ''
    },
    others: {
        type: String,
        default: ''
    },

    // 정산 관리
    departureFee: {
        type: Number,
        default: 0
    },
    arrivalFee: {
        type: Number,
        default: 0
    },
    dokdoFee: {
        type: Number,
        default: 0
    },
    restaurantFee: {
        type: Number,
        default: 0
    },
    eventFee: {
        type: Number,
        default: 0
    },
    otherFee: {
        type: Number,
        default: 0
    },
    refund: {
        type: Number,
        default: 0
    },
    totalSettlement: {
        type: Number,
        default: 0
    },
    profit: {
        type: Number,
        default: 0
    },

    // 하이라이트 상태 관리
    highlights: {
        totalPrice: {
            type: Boolean,
            default: false
        },
        deposit: {
            type: Boolean,
            default: false
        },
        balance: {
            type: Boolean,
            default: false
        }
    },

    // 상태 관리
    status: {
        type: String,
        enum: ['active', 'cancelled', 'completed'],
        default: 'active'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// 저장 전 자동 계산
bookingSchema.pre('save', function(next) {
    try {
        // 잔금 계산 (소수점 절삭)
        this.balance = Math.floor(this.totalPrice - this.deposit);

        // 총 정산비 계산 (소수점 절삭)
        this.totalSettlement = Math.floor(
            this.departureFee +
            this.arrivalFee +
            this.dokdoFee +
            this.restaurantFee +
            this.eventFee +
            this.otherFee +
            this.refund
        );

        // 수익 계산 (소수점 절삭)
        this.profit = Math.floor(this.totalPrice - this.totalSettlement);

        next();
    } catch (error) {
        next(error);
    }
});

// 예약 생성/수정 시 좌석 상태 업데이트
bookingSchema.post('save', async function(doc) {
    try {
        const SeatStatus = mongoose.model('SeatStatus');
        
        // 출발 좌석 상태 업데이트
        await SeatStatus.updateSeatStatus(
            this.ship,
            this.departureDate,
            'departure',
            {
                economy: this.economySeats,
                business: this.businessSeats,
                first: this.firstSeats
            }
        );

        // 도착 좌석 상태 업데이트
        await SeatStatus.updateSeatStatus(
            this.ship,
            this.arrivalDate,
            'arrival',
            {
                economy: this.economySeats,
                business: this.businessSeats,
                first: this.firstSeats
            }
        );
    } catch (error) {
        console.error('좌석 상태 업데이트 중 오류:', error);
    }
});

// 예약 삭제 시 좌석 상태 업데이트
bookingSchema.pre('remove', async function(next) {
    try {
        const SeatStatus = mongoose.model('SeatStatus');
        
        // 출발/도착 좌석 상태 업데이트
        await Promise.all([
            SeatStatus.updateSeatStatus(
                this.ship,
                this.departureDate,
                'departure',
                {
                    economy: -this.economySeats,
                    business: -this.businessSeats,
                    first: -this.firstSeats
                }
            ),
            SeatStatus.updateSeatStatus(
                this.ship,
                this.arrivalDate,
                'arrival',
                {
                    economy: -this.economySeats,
                    business: -this.businessSeats,
                    first: -this.firstSeats
                }
            )
        ]);

        next();
    } catch (error) {
        next(error);
    }
});

// 하이라이트 토글 메서드
bookingSchema.methods.toggleHighlight = async function(field) {
    try {
        if (this.highlights.hasOwnProperty(field)) {
            this.highlights[field] = !this.highlights[field];
            await this.save();
        }
        return this.highlights[field];
    } catch (error) {
        throw new Error('하이라이트 상태 변경 중 오류가 발생했습니다.');
    }
};

// 유효성 검사
bookingSchema.methods.validateSeats = async function() {
    try {
        const Ship = mongoose.model('Ship');
        const ship = await Ship.findById(this.ship);
        
        if (!ship) throw new Error('선박 정보를 찾을 수 없습니다.');

        // 출발 좌석 검증
        const departurePossible = await ship.checkAvailability(
            this.departureDate,
            'departure',
            'economy', this.economySeats
        );
        if (!departurePossible) throw new Error('출발 좌석이 부족합니다.');

        // 도착 좌석 검증
        const arrivalPossible = await ship.checkAvailability(
            this.arrivalDate,
            'arrival',
            'economy', this.economySeats
        );
        if (!arrivalPossible) throw new Error('도착 좌석이 부족합니다.');

        return true;
    } catch (error) {
        throw error;
    }
};

module.exports = mongoose.model('Booking', bookingSchema);