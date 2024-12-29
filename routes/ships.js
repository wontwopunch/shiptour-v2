// routes/ships.js
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./auth');
const Ship = require('../models/Ship');
const Booking = require('../models/Booking');

// 선박 목록 조회
router.get('/', authenticateUser, async (req, res) => {
    try {
        const ships = await Ship.find().sort({ name: 1 });
        res.render('ships', { ships });
    } catch (error) {
        console.error('선박 목록 조회 중 에러:', error);
        res.status(500).json({ 
            success: false, 
            message: '선박 목록을 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

// 선박 등록
router.post('/', authenticateUser, async (req, res) => {
    try {
        const { name } = req.body;
        
        // 이름 중복 체크
        const existingShip = await Ship.findOne({ name });
        if (existingShip) {
            return res.status(400).json({ 
                success: false, 
                message: '이미 등록된 선박명입니다.' 
            });
        }

        // 새 선박 생성
        const newShip = new Ship({ name });
        await newShip.save();

        res.status(201).json({
            success: true,
            message: '선박이 등록되었습니다.',
            ship: newShip
        });
    } catch (error) {
        console.error('선박 등록 중 에러:', error);
        res.status(500).json({ 
            success: false, 
            message: '선박 등록 중 오류가 발생했습니다.' 
        });
    }
});

// 선박 정보 수정
router.put('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        // 이름 중복 체크 (자기 자신 제외)
        const existingShip = await Ship.findOne({ 
            name, 
            _id: { $ne: id } 
        });
        
        if (existingShip) {
            return res.status(400).json({ 
                success: false, 
                message: '이미 등록된 선박명입니다.' 
            });
        }

        const updatedShip = await Ship.findByIdAndUpdate(
            id,
            { name },
            { new: true, runValidators: true }
        );

        if (!updatedShip) {
            return res.status(404).json({ 
                success: false, 
                message: '선박을 찾을 수 없습니다.' 
            });
        }

        res.json({
            success: true,
            message: '선박 정보가 수정되었습니다.',
            ship: updatedShip
        });
    } catch (error) {
        console.error('선박 정보 수정 중 에러:', error);
        res.status(500).json({ 
            success: false, 
            message: '선박 정보 수정 중 오류가 발생했습니다.' 
        });
    }
});

// 선박 삭제
router.delete('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        // 예약 여부 확인
        const hasBookings = await Booking.exists({ ship: id });
        
        if (hasBookings) {
            return res.status(400).json({ 
                success: false, 
                message: '예약이 존재하는 선박은 삭제할 수 없습니다.' 
            });
        }

        const deletedShip = await Ship.findByIdAndDelete(id);
        
        if (!deletedShip) {
            return res.status(404).json({ 
                success: false, 
                message: '선박을 찾을 수 없습니다.' 
            });
        }

        res.json({
            success: true,
            message: '선박이 삭제되었습니다.'
        });
    } catch (error) {
        console.error('선박 삭제 중 에러:', error);
        res.status(500).json({ 
            success: false, 
            message: '선박 삭제 중 오류가 발생했습니다.' 
        });
    }
});

// 선박 상세 정보 조회 (선택적)
router.get('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const ship = await Ship.findById(id);
        
        if (!ship) {
            return res.status(404).json({ 
                success: false, 
                message: '선박을 찾을 수 없습니다.' 
            });
        }

        // 해당 선박의 예약 정보도 함께 조회
        const bookings = await Booking.find({ ship: id });

        res.json({
            success: true,
            ship,
            bookings
        });
    } catch (error) {
        console.error('선박 상세 정보 조회 중 에러:', error);
        res.status(500).json({ 
            success: false, 
            message: '선박 정보를 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

// 에러 처리 미들웨어
router.use((err, req, res, next) => {
    console.error('선박 관리 중 에러 발생:', err);
    res.status(500).json({ 
        success: false, 
        message: '요청을 처리하는 중 오류가 발생했습니다.' 
    });
});

module.exports = router;