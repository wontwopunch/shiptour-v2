// routes/auth.js
const express = require('express');
const router = express.Router();

// 인증 미들웨어
const authenticateUser = (req, res, next) => {
    if (req.session && req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/');
    }
};

// 로그인 페이지
router.get('/', (req, res) => {
    // 이미 로그인된 경우 선박 등록 페이지로 리다이렉트
    if (req.session && req.session.isAuthenticated) {
        return res.redirect('/ships');
    }
    res.render('login', { error: null });
});

// 로그인 처리
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    // 로그인 검증
    if (username === 'jamjari' && password === 'coco1001') {
        req.session.isAuthenticated = true;
        req.session.username = username;
        return res.redirect('/ships');
    } else {
        return res.render('login', { 
            error: '아이디 또는 비밀번호가 올바르지 않습니다.' 
        });
    }
});

// 로그아웃
router.post('/logout', authenticateUser, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('세션 삭제 중 에러 발생:', err);
            return res.status(500).send('로그아웃 처리 중 오류가 발생했습니다.');
        }
        res.redirect('/');
    });
});

// GET 방식의 로그아웃 (선택적)
router.get('/logout', authenticateUser, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('세션 삭제 중 에러 발생:', err);
            return res.status(500).send('로그아웃 처리 중 오류가 발생했습니다.');
        }
        res.redirect('/');
    });
});

// 인증 상태 체크 API (선택적)
router.get('/check', (req, res) => {
    res.json({ 
        isAuthenticated: req.session && req.session.isAuthenticated || false 
    });
});

// 에러 처리 미들웨어
router.use((err, req, res, next) => {
    console.error('인증 처리 중 에러 발생:', err);
    res.status(500).render('error', { 
        message: '인증 처리 중 오류가 발생했습니다.' 
    });
});

// 인증 미들웨어 내보내기
module.exports = {
    router,
    authenticateUser
};