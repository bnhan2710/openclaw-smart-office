function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function analyzeAdministrativeDocument(text) {
  if (!String(text ?? "").trim()) throw new Error("Document text is required");
  const content = String(text);
  const requiredFixes = [];
  const suggestions = [];

  const checks = [
    ["missing_national_header", "Thiếu quốc hiệu/tiêu ngữ.", [/CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/i, /CONG HOA XA HOI CHU NGHIA VIET NAM/i]],
    ["missing_motto", "Thiếu dòng Độc lập - Tự do - Hạnh phúc.", [/Độc lập\s*[-–]\s*Tự do\s*[-–]\s*Hạnh phúc/i, /Doc lap\s*[-–]\s*Tu do\s*[-–]\s*Hanh phuc/i]],
    ["missing_document_number", "Thiếu số hiệu văn bản.", [/\bSố\s*:\s*\d+\/[A-ZĐ0-9-]+/i, /\bSo\s*:\s*\d+\/[A-Z0-9-]+/i]],
    ["missing_issue_date", "Thiếu ngày ban hành hợp lệ.", [/ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/i, /ngay\s+\d{1,2}\s+thang\s+\d{1,2}\s+nam\s+\d{4}/i]],
    ["missing_recipient", "Thiếu Kính gửi/Kính trình.", [/Kính gửi\s*:/i, /Kính trình\s*:/i, /Kinh gui\s*:/i, /Kinh trinh\s*:/i]],
    ["missing_distribution", "Thiếu mục Nơi nhận.", [/Nơi nhận\s*:/i, /Noi nhan\s*:/i]],
  ];

  for (const [code, message, patterns] of checks) {
    if (!hasAny(content, patterns)) requiredFixes.push({ code, message });
  }

  if (!/V\/v|Về việc/i.test(content)) {
    suggestions.push({ code: "missing_subject", message: "Nên bổ sung trích yếu hoặc dòng V/v để dễ tra cứu." });
  }
  if (content.length < 150) {
    suggestions.push({ code: "short_body", message: "Nội dung quá ngắn; kiểm tra lại căn cứ và yêu cầu thực hiện." });
  }

  return { passed: requiredFixes.length === 0, requiredFixes, suggestions };
}
