// 전역 변수 선언
var modifiedStatuses = new Set();

function updateSeatStatus(input) {
    const row = input.closest('tr');
    const statusId = row.dataset.id;
    const type = input.dataset.type;
    const seatClass = input.dataset.class;

    // 해당 클래스의 잔여석 계산
    calculateRemaining(row, type, seatClass);

    // 변경 사항 표시
    row.classList.add('modified');
    modifiedStatuses.add(statusId);

    // 저장 버튼 표시
    const saveButton = document.getElementById('saveChanges');
    if (saveButton) {
        saveButton.classList.add('show');
    }
}

// 잔여 좌석 계산
function calculateRemaining(row, type, seatClass) {
    try {
        // 예약 좌석 셀 찾기 (type: 'departure' 또는 'arrival')
        const reservedCells = row.querySelectorAll(`.${type}-reserved.seat-info`);
        let reservedCell;
        
        // 좌석 클래스별 인덱스 (이코노미:0, 비즈니스:1, 퍼스트:2)
        const classIndex = {
            'economy': 0,
            'business': 1,
            'first': 2
        }[seatClass];

        if (classIndex !== undefined) {
            reservedCell = reservedCells[classIndex];
        }

        if (!reservedCell) {
            console.error('예약 좌석 정보를 찾을 수 없습니다:', { type, seatClass });
            return;
        }

        const reservedSeats = parseInt(reservedCell.textContent.trim()) || 0;

        // 해당 타입과 클래스의 블럭 좌석 input 찾기
        const blockedInput = row.querySelector(`.${type}-blocked input[data-type="${type}"][data-class="${seatClass}"]`);
        if (!blockedInput) {
            console.error('블럭 좌석 입력을 찾을 수 없습니다:', { type, seatClass });
            return;
        }

        const blockedSeats = parseInt(blockedInput.value) || 0;

        // 잔여석 계산
        const remainingSeats = blockedSeats - reservedSeats;

        // 해당 타입과 클래스의 잔여석 셀 찾기
        const remainingCells = row.querySelectorAll(`.${type}-remaining`);
        const remainingCell = remainingCells[classIndex];

        if (remainingCell) {
            remainingCell.textContent = remainingSeats;
            remainingCell.classList.toggle('seat-shortage', remainingSeats < 0);
        }

        console.log(`${type} ${seatClass} 좌석 계산:`, {
            reserved: reservedSeats,
            blocked: blockedSeats,
            remaining: remainingSeats
        });

    } catch (error) {
        console.error('좌석 계산 오류:', error);
    }
}


// 변경사항 저장
async function saveChanges() {
    const saveButton = document.getElementById('saveChanges');
    const saveText = document.getElementById('saveText');
    const saveSpinner = document.getElementById('saveSpinner');
 
    try {
        saveButton.disabled = true;
        saveText.textContent = '저장 중...';
        if (saveSpinner) {
            saveSpinner.style.display = 'inline-block';
        }
 
        for (const statusId of modifiedStatuses) {
            const row = document.querySelector(`tr[data-id="${statusId}"]`);
            // 저장할 데이터 수집
            const data = {
                statusId,
                departure: {
                    economyBlocked: parseInt(row.querySelector('.departure-blocked input[data-type="departure"][data-class="economy"]').value) || 0,
                    businessBlocked: parseInt(row.querySelector('.departure-blocked input[data-type="departure"][data-class="business"]').value) || 0,
                    firstBlocked: parseInt(row.querySelector('.departure-blocked input[data-type="departure"][data-class="first"]').value) || 0
                },
                arrival: {
                    economyBlocked: parseInt(row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="economy"]').value) || 0,
                    businessBlocked: parseInt(row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="business"]').value) || 0,
                    firstBlocked: parseInt(row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="first"]').value) || 0
                }
            };
 
            console.log('Saving data:', data);
 
            // 서버에 저장
            const response = await fetch('/status/batch-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
 
            if (!response.ok) {
                throw new Error('저장 실패');
            }
 
            await response.json();
 
            // UI 업데이트: 입력한 블럭 값 유지
            const departureInputs = {
                economy: row.querySelector('.departure-blocked input[data-type="departure"][data-class="economy"]'),
                business: row.querySelector('.departure-blocked input[data-type="departure"][data-class="business"]'),
                first: row.querySelector('.departure-blocked input[data-type="departure"][data-class="first"]')
            };
 
            const arrivalInputs = {
                economy: row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="economy"]'),
                business: row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="business"]'),
                first: row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="first"]')
            };
 
            // 블럭 값 설정
            departureInputs.economy.value = data.departure.economyBlocked;
            departureInputs.business.value = data.departure.businessBlocked;
            departureInputs.first.value = data.departure.firstBlocked;
 
            arrivalInputs.economy.value = data.arrival.economyBlocked;
            arrivalInputs.business.value = data.arrival.businessBlocked;
            arrivalInputs.first.value = data.arrival.firstBlocked;
 
            // 잔여석 재계산
            ['economy', 'business', 'first'].forEach(seatClass => {
                calculateRemaining(row, 'departure', seatClass);
                calculateRemaining(row, 'arrival', seatClass);
            });
        }
        
        modifiedStatuses.clear();
        document.querySelectorAll('.modified').forEach(row => {
            row.classList.remove('modified');
        });
        
        showAlert('변경사항이 저장되었습니다.', 'success');
    } catch (error) {
        console.error('저장 중 오류:', error);
        showAlert('저장 중 오류가 발생했습니다.', 'error');
    } finally {
        saveButton.disabled = false;
        saveText.textContent = '변경사항 저장';
        if (saveSpinner) {
            saveSpinner.style.display = 'none';
        }
        saveButton.classList.remove('show');
    }
 }

// 엑셀 저장
async function exportToExcel() {
    try {
        // API에서 엑셀 데이터 가져오기
        const response = await fetch('/status/excel' + window.location.search);
        if (!response.ok) throw new Error('Failed to fetch data');
        const data = await response.json();
        
        // 엑셀 파일 생성
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "좌석현황");
        
        // 현재 날짜로 파일명 생성
        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `좌석현황_${today}.xlsx`);

        showAlert('엑셀 파일이 생성되었습니다.', 'success');
    } catch (error) {
        console.error('엑셀 저장 중 오류:', error);
        showAlert('엑셀 파일 생성 중 오류가 발생했습니다.', 'error');
    }
}

// 필터링된 데이터 가져오기
function getFilteredData() {
    const rows = document.querySelectorAll('#statusTableBody tr:not([style*="display: none"])');
    return Array.from(rows).map(row => ({
        선박명: row.querySelector('.ship-name')?.textContent || '',
        날짜: row.querySelector('.date')?.textContent || '',
        
        // 포항출항 데이터
        '포항출항_이코노미_예약': row.querySelector('.departure-reserved[data-type="departure"][data-class="economy"]').textContent,
        '포항출항_이코노미_블럭': row.querySelector('.departure-blocked input[data-type="departure"][data-class="economy"]').value,
        '포항출항_이코노미_잔여': row.querySelector('.departure-remaining[data-type="departure"][data-class="economy"]').textContent,
        
        '포항출항_비즈니스_예약': row.querySelector('.departure-reserved[data-type="departure"][data-class="business"]').textContent,
        '포항출항_비즈니스_블럭': row.querySelector('.departure-blocked input[data-type="departure"][data-class="business"]').value,
        '포항출항_비즈니스_잔여': row.querySelector('.departure-remaining[data-type="departure"][data-class="business"]').textContent,
        
        '포항출항_퍼스트_예약': row.querySelector('.departure-reserved[data-type="departure"][data-class="first"]').textContent,
        '포항출항_퍼스트_블럭': row.querySelector('.departure-blocked input[data-type="departure"][data-class="first"]').value,
        '포항출항_퍼스트_잔여': row.querySelector('.departure-remaining[data-type="departure"][data-class="first"]').textContent,
        
        // 울릉출항 데이터
        '울릉출항_이코노미_예약': row.querySelector('.arrival-reserved[data-type="arrival"][data-class="economy"]').textContent,
        '울릉출항_이코노미_블럭': row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="economy"]').value,
        '울릉출항_이코노미_잔여': row.querySelector('.arrival-remaining[data-type="arrival"][data-class="economy"]').textContent,
        
        '울릉출항_비즈니스_예약': row.querySelector('.arrival-reserved[data-type="arrival"][data-class="business"]').textContent,
        '울릉출항_비즈니스_블럭': row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="business"]').value,
        '울릉출항_비즈니스_잔여': row.querySelector('.arrival-remaining[data-type="arrival"][data-class="business"]').textContent,
        
        '울릉출항_퍼스트_예약': row.querySelector('.arrival-reserved[data-type="arrival"][data-class="first"]').textContent,
        '울릉출항_퍼스트_블럭': row.querySelector('.arrival-blocked input[data-type="arrival"][data-class="first"]').value,
        '울릉출항_퍼스트_잔여': row.querySelector('.arrival-remaining[data-type="arrival"][data-class="first"]').textContent
    }));
}

// 필터 적용
function applyFilters() {
    const shipId = document.getElementById('shipFilter').value;
    const month = document.getElementById('monthFilter').value;

    document.querySelectorAll('#statusTableBody tr').forEach(row => {
        const shipMatch = !shipId || row.dataset.shipId === shipId;
        const date = new Date(row.querySelector('.date').textContent);
        const monthMatch = !month || 
            (date.getFullYear() === new Date(month).getFullYear() && 
             date.getMonth() === new Date(month).getMonth());

        row.style.display = shipMatch && monthMatch ? '' : 'none';
    });
}

// 알림 표시
function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert alert-${type} show`;
    setTimeout(() => alert.classList.remove('show'), 3000);
}

document.addEventListener('DOMContentLoaded', function() {
    // 블럭 입력 필드 이벤트 리스너
    const blockInputs = document.querySelectorAll('.departure-blocked input, .arrival-blocked input');
    blockInputs.forEach(input => {
        input.addEventListener('input', function() {
            updateSeatStatus(this);
        });
    });

    // 저장 버튼 이벤트 리스너
    const saveButton = document.getElementById('saveChanges');
    if (saveButton) {
        saveButton.addEventListener('click', saveChanges);
    }

    // 필터 이벤트 리스너
    const shipFilter = document.getElementById('shipFilter');
    const monthFilter = document.getElementById('monthFilter');
    
    if (shipFilter) {
        shipFilter.addEventListener('change', applyFilters);
    }
    if (monthFilter) {
        monthFilter.addEventListener('change', applyFilters);
    }
});


function formatDate(date) {
    return new Date(date).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}