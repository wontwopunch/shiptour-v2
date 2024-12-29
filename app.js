// app.js
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

// Express 앱 생성
const app = express();

// MongoDB 연결
mongoose.connect('mongodb+srv://doadmin:28k9ydU7j4350XJO@db-mongodb-nyc3-07858-e1cce249.mongo.ondigitalocean.com/admin?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB 연결 성공');
}).catch((err) => {
    console.error('MongoDB 연결 실패:', err);
    process.exit(1);
});

// 미들웨어 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 세션 설정
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: 'mongodb://localhost:27017/ship_booking',
        ttl: 24 * 60 * 60 // 24시간
    }),
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    }
}));

// 라우터 임포트
const authRouter = require('./routes/auth').router;
const shipsRouter = require('./routes/ships');
const bookingsRouter = require('./routes/bookings');
const statusRouter = require('./routes/status');

// 인증 미들웨어
const { authenticateUser } = require('./routes/auth');

// 기본 미들웨어
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    res.locals.isAuthenticated = !!req.session.user;
    next();
});

// 라우터 설정
app.use('/', authRouter);
app.use('/ships', authenticateUser, shipsRouter);
app.use('/bookings', authenticateUser, bookingsRouter);
app.use('/status', authenticateUser, statusRouter);

// 404 에러 처리
app.use((req, res, next) => {
    res.status(404).render('error', {
        message: '페이지를 찾을 수 없습니다.',
        error: {}
    });
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('error', {
        message: err.message,
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});

// 프로세스 종료 시 MongoDB 연결 종료
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB 연결이 안전하게 종료되었습니다.');
        process.exit(0);
    } catch (err) {
        console.error('MongoDB 연결 종료 중 오류:', err);
        process.exit(1);
    }
});

module.exports = app;