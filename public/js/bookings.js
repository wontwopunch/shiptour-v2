
let modifiedRows = new Set();

// 천단위 콤마 포맷팅
function formatNumber(num) {
    return Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 수정 표시 함수
function markModified(element) {
    const row = element.closest('tr');
    if (!row) return; // row가 없으면 함수 종료

    row.classList.add('modified');

    if (row.dataset.id) {
        modifiedRows.add(row.dataset.id);
    }

    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        saveButton.classList.add('show');
    }
}


// 하이라이트 토글
function toggleHighlight(cell) {
    if (!cell) return;
    
    cell.classList.toggle('highlighted');
    const input = cell.querySelector('input');
    if (input) {
        input.classList.toggle('highlighted');
    }
    
    markModified(cell.closest('tr'));
}

// 날짜 변경 처리
function handleDateChange(input) {
    markModified(input);
    sortRows();
}

// 자동 계산 함수
function calculateTotals(row) {
    try {
        // 문자열에서 숫자 변환 함수
        const getAmount = (name) => {
            const input = row.querySelector(`[name="${name}"]`);
            if (!input) return 0;
            return parseInt(input.value.replace(/,/g, '')) || 0;
        };

        // 값 설정 함수
        const setAmount = (name, value) => {
            const input = row.querySelector(`[name="${name}"]`);
            if (input) {
                input.value = formatNumber(value);
            }
            const span = row.querySelector(`[name="${name}"] + span`);
            if (span) {
                span.textContent = formatNumber(value);
            }
        };

        // 1. 총금액 - 계약금 = 잔금
        const totalAmount = getAmount('totalPrice');
        const deposit = getAmount('deposit');
        const balance = totalAmount - deposit;
        setAmount('balance', balance);

        // 2. 모든 비용의 합 = 총 정산비
        const totalSettlement = [
            'departureFee',  // 출항비
            'arrivalFee',    // 입항비
            'dokdoFee',      // 독도비
            'restaurantFee', // 식당비
            'eventFee',      // 행사비
            'otherFee',      // 기타비
            'refund'         // 환불
        ].reduce((sum, fee) => sum + getAmount(fee), 0);
        setAmount('totalSettlement', totalSettlement);

        // 3. 총금액 - 총 정산비 = 수익
        const profit = totalAmount - totalSettlement;
        setAmount('profit', profit);

        // 4. 모든 행의 수익을 합산하여 상단에 표시
        updateTotalProfit();

        // 변경사항 표시
        markModified(row);

    } catch (error) {
        console.error('계산 중 오류:', error);
    }
}

// 총 수익 업데이트
function updateTotalProfit() {
    const totalProfitElement = document.getElementById('totalProfitAmount');
    if (!totalProfitElement) return;

    // 모든 행의 수익(profit) input 값을 합산
    const totalProfit = Array.from(document.querySelectorAll('input[name="profit"]'))
        .reduce((sum, input) => {
            // 콤마 제거하고 숫자로 변환
            const value = parseInt(input.value.replace(/,/g, '')) || 0;
            return sum + value;
        }, 0);

    // 결과를 천단위 콤마 포맷팅하여 표시
    totalProfitElement.textContent = formatNumber(totalProfit);
}

// 행 이벤트 리스너 추가
function attachRowEventListeners(row) {
    // 금액 필드에 이벤트 추가
    row.querySelectorAll('.amount-cell input').forEach(input => {
        // 입력 중 숫자만 허용
        input.addEventListener('input', () => {
            input.value = input.value.replace(/[^0-9,]/g, ''); // 숫자와 쉼표만 허용
            calculateTotals(row); // 즉시 계산 반영
        });
 
        // 포커스 아웃 시 천단위 콤마 및 계산
        input.addEventListener('blur', () => {
            const value = parseInt(input.value.replace(/,/g, '')) || 0;
            input.value = formatNumber(value);
            calculateTotals(row);
        });
    });
 
    // 날짜 필드에 이벤트 추가
    row.querySelectorAll('[name="departureDate"], [name="arrivalDate"]').forEach(input => {
        input.addEventListener('change', () => {
            handleDateChange(input);
            markModified(input);
        });
    });
 
    // 일반 입력 필드에 이벤트 추가 (금액, 날짜 제외)
    row.querySelectorAll('input:not(.amount-cell input):not([name="departureDate"]):not([name="arrivalDate"]), select').forEach(input => {
        input.addEventListener('change', () => {
            markModified(input);
            if (input.classList.contains('amount-input')) {
                calculateTotals(row);
            }
        });
    });
 
    // 초기 계산 수행
    calculateTotals(row);
 }

// 새 행에 대한 임시 ID 생성 함수
function generateTempId() {
    return 'temp_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
}

// 새 행 추가
function addNewRow() {
    const tbody = document.getElementById('bookingTableBody');
    if (!tbody) {
        console.error('테이블 본문 요소를 찾을 수 없습니다.');
        return;
    }

    // 새 행 생성
    const newRow = document.createElement('tr');
    // 임시 ID 부여
    const tempId = generateTempId();
    newRow.dataset.id = tempId;
    newRow.classList.add('modified');

    // 선박 목록 가져오기
    const ships = window.availableShips || [];
    const shipOptions = ships.map(ship => `<option value="${ship._id}">${ship.name}</option>`).join('');

    // 새 행 HTML 구조 정의
    newRow.innerHTML = `
        <td class="editable-cell">
            <select name="shipName" required>
                <option value="">선택</option>
                ${shipOptions}
            </select>
        </td>
        <td class="editable-cell"><input type="text" name="listStatus"></td>
        <td class="editable-cell"><input type="date" name="contractDate"></td>
        <td class="editable-cell"><input type="date" name="departureDate"></td>
        <td class="editable-cell"><input type="date" name="arrivalDate"></td>
        <td class="editable-cell"><input type="text" name="reservedBy"></td>
        <td class="editable-cell"><input type="text" name="reservedBy2"></td>
        <td class="editable-cell"><input type="text" name="contact"></td>
        <td class="editable-cell"><input type="text" name="product"></td>
        <td class="editable-cell"><input type="number" name="totalSeats" value="0"></td>
        <td class="editable-cell"><input type="number" name="economySeats" value="0"></td>
        <td class="editable-cell"><input type="number" name="businessSeats" value="0"></td>
        <td class="editable-cell"><input type="number" name="firstSeats" value="0"></td>
        <td class="editable-cell"><input type="date" name="dokdoTourDate"></td>
        <td class="editable-cell"><input type="number" name="dokdoTourPeople" value="0"></td>
        <td class="editable-cell"><input type="text" name="dokdoTourTime"></td>
        <td class="editable-cell"><input type="text" name="dokdoTourDetails"></td>
        <td class="amount-cell"><input type="text" name="totalPrice" value="0" class="amount-input"></td>
        <td class="amount-cell"><input type="text" name="deposit" value="0" class="amount-input"></td>
        <td class="amount-cell calculated-field"><span>0</span></td>
        <td class="editable-cell"><input type="text" name="rentalCar"></td>
        <td class="editable-cell"><input type="text" name="accommodation"></td>
        <td class="editable-cell"><input type="text" name="others"></td>
        <td class="amount-cell"><input type="text" name="departureFee" value="0" class="amount-input"></td>
        <td class="amount-cell"><input type="text" name="arrivalFee" value="0" class="amount-input"></td>
        <td class="amount-cell"><input type="text" name="dokdoFee" value="0" class="amount-input"></td>
        <td class="amount-cell"><input type="text" name="restaurantFee" value="0" class="amount-input"></td>
        <td class="amount-cell"><input type="text" name="eventFee" value="0" class="amount-input"></td>
        <td class="amount-cell"><input type="text" name="otherFee" value="0" class="amount-input"></td>
        <td class="amount-cell"><input type="text" name="refund" value="0" class="amount-input"></td>
        <td class="amount-cell calculated-field">0</td>
        <td class="amount-cell calculated-field">0</td>
        <td>
            <button onclick="deleteRow(this)" class="btn btn-danger">삭제</button>
        </td>
    `;

    // 새 행에 이벤트 리스너 추가
    attachRowEventListeners(newRow);
    
    // 테이블에 새 행 추가
    tbody.appendChild(newRow);
    
    // 변경 사항 표시
    modifiedRows.add(tempId);
    document.getElementById('saveButton').classList.add('show');

    // 정렬 적용
    sortRows();
}

// 새로 추가된 행 삭제
function deleteRow(button) {
    const row = button.closest('tr');
    const id = row.dataset.id;
    
    if (id.startsWith('temp_')) {
        // 임시 행인 경우 바로 삭제
        row.remove();
        modifiedRows.delete(id);
    } else {
        // 기존 행인 경우 deleteBooking 함수 호출
        deleteBooking(id);
    }
}

// 행 정렬
function sortRows() {
    const tbody = document.getElementById('bookingTableBody');
    const rows = Array.from(tbody.getElementsByTagName('tr'));

    rows.sort((a, b) => {
        const dateA = new Date(a.querySelector('[name="departureDate"]').value || '9999-12-31');
        const dateB = new Date(b.querySelector('[name="departureDate"]').value || '9999-12-31');

        if (dateA.getTime() === dateB.getTime()) {
            const arrivalA = new Date(a.querySelector('[name="arrivalDate"]').value || '9999-12-31');
            const arrivalB = new Date(b.querySelector('[name="arrivalDate"]').value || '9999-12-31');
            return arrivalA - arrivalB;
        }
        return dateA - dateB;
    });

    rows.forEach(row => tbody.appendChild(row));
}

// 예약 삭제
// 예약 삭제
router.delete('/:id', authenticateUser, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        // 예약 찾기
        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: '예약을 찾을 수 없습니다.'
            });
        }

        // 예약과 관련된 좌석 상태 업데이트 (선택사항)
        const SeatStatus = require('../models/SeatStatus');
        await SeatStatus.updateSeatStatus(
            booking.ship,
            booking.departureDate,
            'departure',
            {
                economy: -booking.economySeats,
                business: -booking.businessSeats,
                first: -booking.firstSeats
            }
        );

        await SeatStatus.updateSeatStatus(
            booking.ship,
            booking.arrivalDate,
            'arrival',
            {
                economy: -booking.economySeats,
                business: -booking.businessSeats,
                first: -booking.firstSeats
            }
        );

        // 예약 삭제
        await Booking.findByIdAndDelete(id);
        await session.commitTransaction();

        res.json({
            success: true,
            message: '예약이 삭제되었습니다.'
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('예약 삭제 중 오류:', error);
        res.status(500).json({
            success: false,
            message: '예약 삭제 중 오류가 발생했습니다.'
        });
    } finally {
        session.endSession();
    }
});

// 변경사항 저장
async function saveChanges() {
    const saveButton = document.getElementById('saveButton');
    const saveText = document.getElementById('saveText');
    const saveSpinner = document.getElementById('saveSpinner');
 
    try {
        saveButton.disabled = true;
        saveText.textContent = '저장 중...';
        saveSpinner.style.display = 'inline-block';
 
        // 수정된 행 데이터 수집
        const bookings = Array.from(modifiedRows).map(id => {
            const row = document.querySelector(`tr[data-id="${id}"]`);
            const bookingData = { _id: id };
            
            // 새 행인지 확인 (임시 ID 제거)
            if (id.startsWith('temp_')) {
                delete bookingData._id;
            }
            
            // 모든 입력 필드의 데이터 수집
            row.querySelectorAll('input, select').forEach(input => {
                if (input.name === 'shipName') {
                    bookingData.ship = input.value; // 선박 ID 저장
                } else if (input.classList.contains('amount-input') || 
                          input.name.endsWith('Fee') || 
                          input.name === 'totalPrice' || 
                          input.name === 'deposit' || 
                          input.name === 'refund') {
                    // 금액 필드는 쉼표 제거 및 숫자 변환
                    bookingData[input.name] = parseInt(input.value.replace(/,/g, '')) || 0;
                } else if (input.type === 'number') {
                    // 숫자 필드는 숫자로 변환
                    bookingData[input.name] = parseInt(input.value) || 0;
                } else {
                    // 나머지 필드는 문자열로 저장
                    bookingData[input.name] = input.value;
                }
            });
 
            // 하이라이트 상태 저장
            bookingData.highlights = {
                totalPrice: false,
                deposit: false,
                balance: false
            };
 
            // 각 금액 필드의 하이라이트 상태 체크
            ['totalPrice', 'deposit', 'balance'].forEach(field => {
                const cell = row.querySelector(`td[data-field="${field}"]`);
                if (cell && cell.querySelector('input.highlighted')) {
                    bookingData.highlights[field] = true;
                }
            });
 
            return bookingData;
        });
 
        const response = await fetch('/bookings/batch-save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bookings })
        });
 
        if (!response.ok) {
            throw new Error('저장 실패');
        }
 
        const result = await response.json();
 
        // 임시 ID를 실제 ID로 업데이트
        if (result.bookings) {
            result.bookings.forEach(booking => {
                const row = document.querySelector(`tr[data-id^="temp_"]`);
                if (row) {
                    row.dataset.id = booking._id;
                }
            });
        }
 
        modifiedRows.clear();
        document.querySelectorAll('.modified').forEach(row => {
            row.classList.remove('modified');
        });
        
        showAlert('변경사항이 저장되었습니다.', 'success');
        
        // 저장 후 총 수익 업데이트
        updateTotalProfit();
    } catch (error) {
        console.error('저장 중 오류:', error);
        showAlert('저장 중 오류가 발생했습니다.', 'error');
    } finally {
        saveButton.disabled = false;
        saveText.textContent = '변경사항 저장';
        saveSpinner.style.display = 'none';
        saveButton.classList.remove('show');
    }
 }


// 엑셀로 데이터 내보내기 함수 정의
// 엑셀 저장 함수
function exportToExcel() {
    const filteredData = getFilteredData();  // 필터링된 데이터를 가져옴
    const wb = XLSX.utils.book_new();        // 새 엑셀 워크북 생성
    const ws = XLSX.utils.json_to_sheet(filteredData); // 데이터를 시트로 변환

    XLSX.utils.book_append_sheet(wb, ws, 'Bookings'); // 워크북에 시트 추가
    XLSX.writeFile(wb, 'bookings.xlsx');  // 파일로 다운로드
}



// 필터링된 데이터 가져오기
function getFilteredData() {
    const monthFilter = document.getElementById('monthFilter').value;
    const bookerFilter = document.getElementById('bookerFilter').value.toLowerCase();
    
    const rows = document.querySelectorAll('#bookingTableBody tr:not([style*="display: none"])');
    
    return Array.from(rows).map(row => {
        const getValue = (selector, defaultValue = '') => {
            const element = row.querySelector(selector);
            return element ? element.value : defaultValue;
        };

        const getText = (selector, defaultValue = '') => {
            const element = row.querySelector(selector);
            return element ? element.text : defaultValue;
        };

        // 월 필터링 (yyyy-mm 형식)
        const contractDate = getValue('[name="contractDate"]');
        const matchesMonth = monthFilter ? contractDate.startsWith(monthFilter) : true;
        
        // 예약자명 필터링
        const reservedBy = getValue('[name="reservedBy"]').toLowerCase();
        const matchesBooker = bookerFilter ? reservedBy.includes(bookerFilter) : true;

        // 월과 예약자명 필터 조건을 만족하는 데이터만 반환
        if (matchesMonth && matchesBooker) {
            return {
                선박명: getText('[name="shipName"] option:checked'),
                명단: getValue('[name="listStatus"]'),
                계약일: contractDate,
                출항일: getValue('[name="departureDate"]'),
                입항일: getValue('[name="arrivalDate"]'),
                예약자명: getValue('[name="reservedBy"]'),
                예약자명2: getValue('[name="reservedBy2"]'),
                연락처: getValue('[name="contact"]'),
                상품: getValue('[name="product"]'),
                총좌석: getValue('[name="totalSeats"]'),
                이코노미: getValue('[name="economySeats"]'),
                비즈니스: getValue('[name="businessSeats"]'),
                퍼스트: getValue('[name="firstSeats"]'),
                독도관광날짜: getValue('[name="dokdoTourDate"]'),
                독도관광인원: getValue('[name="dokdoTourPeople"]'),
                독도관광시간: getValue('[name="dokdoTourTime"]'),
                상품내용: getValue('[name="dokdoTourDetails"]'),
                총금액: getValue('[name="totalPrice"]'),
                계약금: getValue('[name="deposit"]'),
                잔금: getValue('[name="balance"]'),
                렌터카: getValue('[name="rentalCar"]'),
                숙박: getValue('[name="accommodation"]'),
                기타: getValue('[name="others"]'),
                출항비: getValue('[name="departureFee"]'),
                입항비: getValue('[name="arrivalFee"]'),
                독도비: getValue('[name="dokdoFee"]'),
                식당비: getValue('[name="restaurantFee"]'),
                행사비: getValue('[name="eventFee"]'),
                기타비: getValue('[name="otherFee"]'),
                환불: getValue('[name="refund"]'),
                총정산비: getValue('[name="totalSettlement"]'),
                수익: getValue('[name="profit"]')
            };
        }
    }).filter(item => item !== undefined); // 필터링된 데이터만 반환
}

// 필터 적용
function applyFilters() {
    const shipFilter = document.getElementById('shipFilter').value;
    const monthFilter = document.getElementById('monthFilter').value;
    const bookerFilter = document.getElementById('bookerFilter').value.toLowerCase();

    document.querySelectorAll('#bookingTableBody tr').forEach(row => {
        const shipMatch = !shipFilter || row.querySelector('[name="shipName"]').value === shipFilter;
        const departureDate = row.querySelector('[name="departureDate"]').value;
        const monthMatch = !monthFilter || departureDate.startsWith(monthFilter);
        const bookerName = row.querySelector('[name="reservedBy"]').value.toLowerCase();
        const bookerMatch = !bookerFilter || bookerName.includes(bookerFilter);

        row.style.display = shipMatch && monthMatch && bookerMatch ? '' : 'none';
    });

    updateTotalProfit();
}

// 알림 표시
function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert alert-${type} show`;
    setTimeout(() => alert.classList.remove('show'), 3000);
}

// 초기화 및 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', function() {
    // 요소 찾기
    const shipFilter = document.getElementById('shipFilter');
    const monthFilter = document.getElementById('monthFilter');
    const bookerFilter = document.getElementById('bookerFilter');
    const saveButton = document.getElementById('saveButton');
    const addRowButton = document.getElementById('addRow');
    const bookingRows = document.querySelectorAll('#bookingTableBody tr');
 
    // 필터 이벤트
    if (shipFilter) {
        shipFilter.addEventListener('change', applyFilters);
    }
    
    if (monthFilter) {
        monthFilter.addEventListener('change', applyFilters);
    }
    
    if (bookerFilter) {
        bookerFilter.addEventListener('input', applyFilters);
    }
 
    // 저장 버튼
    if (saveButton) {
        saveButton.addEventListener('click', saveChanges);
    }
 
    // 새 행 추가 버튼 
    if (addRowButton) {
        addRowButton.addEventListener('click', addNewRow);
    }
 
    // 기존 행에 이벤트 리스너 추가
    if (bookingRows.length > 0) {
        bookingRows.forEach(row => {
            attachRowEventListeners(row);
        });
    }
 
    // 초기 총 수익 계산
    updateTotalProfit();
 });

function formatDate(date) {
    return new Date(date).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}