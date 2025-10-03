import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
// Sử dụng cors để cho phép các ứng dụng web khác gọi API
app.use(cors());

const PORT = process.env.PORT || 3000;

// Lưu pattern gần nhất (tối đa 20)
let patternHistory = "";

/**
 * @function updatePattern
 * @description Cập nhật lịch sử cầu Tài Xỉu (chỉ giữ 20 phiên gần nhất).
 * @param {string} result - 't' cho Tài, 'x' cho Xỉu.
 */
function updatePattern(result) {
  if (patternHistory.length >= 20) {
    // Cắt bớt ký tự đầu tiên nếu đã đạt 20
    patternHistory = patternHistory.slice(1);
  }
  patternHistory += result;
}

/**
 * @function getTaiXiu
 * @description Xác định kết quả Tài (>= 11) hoặc Xỉu (< 11) từ tổng điểm.
 * @param {number} sum - Tổng 3 viên xúc xắc.
 * @returns {string} - 'Tài' hoặc 'Xỉu'.
 */
function getTaiXiu(sum) {
  // Tổng 10 trở xuống là Xỉu, 11 trở lên là Tài (trừ bộ ba, nhưng API này chỉ dựa vào tổng)
  return sum >= 11 ? 'Tài' : 'Xỉu';
}

/**
 * @function advancedPredictPattern
 * @description Dự đoán cầu dựa trên các pattern cơ bản (bệt, lặp, giằng co).
 * @param {string} history - Chuỗi lịch sử Tài/Xỉu ('t'/'x').
 * @returns {{du_doan: string, do_tin_cay: number}} - Kết quả dự đoán và độ tin cậy.
 */
function advancedPredictPattern(history) {
  if (history.length < 6) return { du_doan: "Chưa đủ dữ liệu", do_tin_cay: 0 };

  // Đếm chuỗi bệt gần nhất
  let lastChar = history[history.length - 1];
  let streakCount = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === lastChar) {
      streakCount++;
    } else {
      break;
    }
  }

  // 1. Nếu bệt >= 3 → Dự đoán bệt tiếp tục (Tin cậy cao)
  if (streakCount >= 3) {
    return {
      du_doan: lastChar === 't' ? "Tài (Bệt)" : "Xỉu (Bệt)",
      do_tin_cay: 90
    };
  }

  // 2. Kiểm tra pattern lặp lại (4 phiên gần đây)
  const patternLength = 4;
  const recentPattern = history.slice(-patternLength);
  let foundPattern = false;

  // Tìm kiếm pattern 4 phiên gần nhất lặp lại trong lịch sử trước đó
  for (let i = history.length - patternLength * 2 - 1; i >= 0; i--) {
    // Kiểm tra nếu pattern trước đó (từ i) khớp với 4 phiên gần nhất
    if (history.substring(i, i + patternLength) === recentPattern) {
      foundPattern = true;
      break;
    }
  }

  if (foundPattern && history.length >= 8) { // Cần ít nhất 8 phiên để xác định lặp pattern 4
    // Dự đoán ký tự tiếp theo sẽ là ký tự đầu tiên của pattern lặp
    const nextChar = recentPattern[0];
    return {
      du_doan: nextChar === 't' ? "Tài (Lặp Pattern)" : "Xỉu (Lặp Pattern)",
      do_tin_cay: 70
    };
  }

  // 3. Kiểm tra cầu giằng co (1-1-1-1-1-1)
  const lastSix = history.slice(-6).toLowerCase();
  if (/^(tx){3}$/.test(lastSix) || /^(xt){3}$/.test(lastSix)) {
    // Nếu đang là T X T X T X (lastChar là X) thì dự đoán T (và ngược lại)
    return {
      du_doan: lastChar === 't' ? "Xỉu (Giằng co)" : "Tài (Giằng co)",
      do_tin_cay: 60
    };
  }

  // 4. Không rõ cầu → Đoán ngược (Tin cậy thấp)
  return {
    du_doan: lastChar === 't' ? "Xỉu (Đảo cầu)" : "Tài (Đảo cầu)",
    do_tin_cay: 50
  };
}

// Endpoint chính để lấy kết quả Tài Xỉu và dự đoán
app.get('/api/taixiu/lottery', async (req, res) => {
  try {
    // Lưu ý: URL này có thể không hoạt động vì nó là một placeholder
    const response = await fetch('https://66.bot/GetNewLottery/LT_TaixiuMD5');
    
    // Kiểm tra trạng thái HTTP
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();

    if (!json || json.state !== 1 || !json.data) {
      return res.status(500).json({ error: 'Dữ liệu trả về từ nguồn không hợp lệ' });
    }

    const data = json.data;
    const dice = data.OpenCode.split(',').map(Number);
    const [d1, d2, d3] = dice;
    const sum = d1 + d2 + d3;
    const ket_qua = getTaiXiu(sum);
    const patternChar = ket_qua === "Tài" ? "t" : "x";

    updatePattern(patternChar);

    const { du_doan, do_tin_cay } = advancedPredictPattern(patternHistory);

    // Bắt đầu từ 1, vì Phien (data.Expect) là phiên hiện tại đã có kết quả
    const phienDuDoan = Number(data.Expect) + 1;
    
    // Trả về JSON theo định dạng mới mà bạn yêu cầu
    return res.json({
      "id": "ĐỘC QUYỀN CỦA @cha tao",
      "Phien": data.Expect, // Phiên hiện tại đã có kết quả
      "Xuc_xac1": d1,
      "Xuc_xac2": d2,
      "Xuc_xac3": d3,
      "Tổng": sum,
      "Phien_du_doan": phienDuDoan, // Phiên tiếp theo cần dự đoán
      "Du_doan": du_doan.split(' ')[0] // Chỉ lấy "Tài" hoặc "Xỉu" cho trường Du_doan
    });
  } catch (error) {
    // Ghi lỗi chi tiết ra console để debug
    console.error('Lỗi khi fetch dữ liệu:', error.message);
    res.status(500).json({ 
        error: 'Lỗi khi fetch dữ liệu hoặc xử lý', 
        details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});

