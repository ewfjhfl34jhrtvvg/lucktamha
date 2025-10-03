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
 * @description Dự đoán cầu dựa trên các pattern cơ bản (giằng co, bệt, 2-1-2-1).
 * @param {string} history - Chuỗi lịch sử Tài/Xỉu ('t'/'x').
 * @returns {{du_doan: string, do_tin_cay: number, ghi_chu: string}} - Kết quả dự đoán, độ tin cậy và ghi chú.
 */
function advancedPredictPattern(history) {
  // Cần ít nhất 8 phiên để xác định các pattern phức tạp hơn
  if (history.length < 8) return { du_doan: "Chưa đủ dữ liệu", do_tin_cay: 0, ghi_chu: "Cần tối thiểu 8 phiên." };

  const lastChar = history[history.length - 1];
  const oppositeChar = lastChar === 't' ? 'x' : 't';

  // 1. Kiểm tra cầu Giằng co (1-1-1-1-1-1 hay T X T X T X)
  const lastSix = history.slice(-6).toLowerCase();
  const giangCoPattern1 = /^(tx){3}$/; // T X T X T X
  const giangCoPattern2 = /^(xt){3}$/; // X T X T X T

  if (giangCoPattern1.test(lastSix) || giangCoPattern2.test(lastSix)) {
    // Nếu đang là T X T X T X (lastChar là X) thì dự đoán T (và ngược lại)
    return {
      du_doan: oppositeChar === 't' ? "Tài" : "Xỉu",
      do_tin_cay: 85,
      ghi_chu: "Cầu Giằng co (1-1)"
    };
  }

  // 2. Kiểm tra chuỗi bệt gần nhất
  let streakCount = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === lastChar) {
      streakCount++;
    } else {
      break;
    }
  }

  // Nếu bệt >= 5 → Dự đoán Bẻ Cầu (Tin cậy cao)
  if (streakCount >= 5) {
      // Bẻ cầu sau khi bệt quá dài (từ 5 phiên trở lên)
      return {
          du_doan: oppositeChar === 't' ? "Tài" : "Xỉu",
          do_tin_cay: 75,
          ghi_chu: `Bẻ cầu sau bệt ${streakCount} (dự đoán đảo)`
      };
  }
  
  // Nếu bệt từ 2 đến 4 → Dự đoán Bệt Tiếp tục (Tin cậy vừa)
  if (streakCount >= 2 && streakCount < 5) {
    return {
      du_doan: lastChar === 't' ? "Tài" : "Xỉu",
      do_tin_cay: 65,
      ghi_chu: `Bệt ${streakCount} (dự đoán theo bệt)`
    };
  }


  // 3. Kiểm tra cầu 2-1-2-1 (Chỉ áp dụng cho 6 phiên gần nhất)
  if (history.length >= 6) {
      const lastSixLower = history.slice(-6).toLowerCase();
      
      // Nếu là T T X T T X (Dự đoán X tiếp theo để tạo 2-1-2-1-2...)
      if (lastSixLower === 'ttxttx') {
          return {
              du_doan: "Xỉu",
              do_tin_cay: 70,
              ghi_chu: "Cầu 2-1-2 (đang là T T X T T, dự đoán X)"
          };
      }
      
      // Nếu là X X T X X T (Dự đoán T tiếp theo để tạo 2-1-2-1-2...)
      if (lastSixLower === 'xxttxx') {
          return {
              du_doan: "Tài",
              do_tin_cay: 70,
              ghi_chu: "Cầu 2-1-2 (đang là X X T X X, dự đoán T)"
          };
      }
  }


  // 4. Không khớp với pattern nổi bật nào → Dự đoán Đảo Cầu (Tin cậy thấp)
  // Đây là hành động mặc định, dự đoán ngược lại với phiên gần nhất.
  return {
    du_doan: oppositeChar === 't' ? "Tài" : "Xỉu",
    do_tin_cay: 50,
    ghi_chu: "Không rõ cầu (Đảo cầu mặc định)"
  };
}

// Endpoint chính để lấy kết quả Tài Xỉu và dự đoán
app.get('/api/taixiu/lottery', async (req, res) => {
  try {
    // LƯU Ý: URL này có thể không hoạt động vì nó là một placeholder
    const response = await fetch('https://1.bot/GetNewLottery/LT_TaixiuMD5');
    
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

    // Lấy thông tin dự đoán đầy đủ
    const { du_doan, do_tin_cay, ghi_chu } = advancedPredictPattern(patternHistory);

    // Bắt đầu từ 1, vì Phien (data.Expect) là phiên hiện tại đã có kết quả
    const phienDuDoan = Number(data.Expect) + 1;
    
    // Trả về JSON với thông tin dự đoán chi tiết
    return res.json({
      "id": "ĐỘC QUYỀN CỦA @cha tao",
      "Phien": data.Expect, // Phiên hiện tại đã có kết quả
      "Xuc_xac1": d1,
      "Xuc_xac2": d2,
      "Xuc_xac3": d3,
      "Tổng": sum,
      "Phien_du_doan": phienDuDoan, // Phiên tiếp theo cần dự đoán
      "Du_doan": du_doan, // "Tài" hoặc "Xỉu"
      "Do_tin_cay": do_tin_cay, // Độ tin cậy của dự đoán
      "Ghi_chu_du_doan": ghi_chu, // Lý do dự đoán
      "Lich_su_cau_gan_nhat": patternHistory.toUpperCase().split('').join('-') // Lịch sử T-X
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
