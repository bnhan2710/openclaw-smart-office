#!/usr/bin/env node
import { parseArgs } from "node:util";

import { printEnvelope, printError } from "../lib/response.js";

const SKILL = "email-composer";

const { values: args } = parseArgs({
  options: {
    request: { type: "string" },
    to: { type: "string" },
    recipient: { type: "string" },
    sender: { type: "string" },
    subject: { type: "string" },
    deadline: { type: "string" },
    time: { type: "string" },
    location: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sentence(value) {
  const text = clean(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function detectIntent(request) {
  const normalized = request.toLowerCase();
  if (/họp|hop|meeting/.test(normalized)) return "meeting_request";
  if (/nhắc|nhac|deadline|hạn|han|quá hạn|qua han/.test(normalized)) return "deadline_reminder";
  if (/báo cáo|bao cao|tổng hợp|tong hop/.test(normalized)) return "report_request";
  if (/phản hồi|phan hoi|trả lời|tra loi/.test(normalized)) return "response_request";
  return "office_notice";
}

function detectUrgency(request) {
  return /khẩn|khan|gấp|gap|urgent|ngay|hỏa tốc|hoa toc/.test(request.toLowerCase());
}

function stripCommandWords(request) {
  const text = clean(request);
  const purposeMatch = text.match(/(?:^|\s)(?:để|de)\s+(.+)$/i);
  const source = purposeMatch ? purposeMatch[1] : text;
  return clean(source)
    .replace(/^(soạn|soan|viết|viet|gửi|gui|tạo|tao)\s+/i, "")
    .replace(/^(yêu cầu|yeu cau|đề nghị|de nghi)\s+/i, "")
    .replace(/\b(email|mail|tin nhắn|tin nhan|nội dung|noi dung)\b/gi, "")
    .replace(/\s+đến\s+mail\s+\S+/i, "")
    .replace(/\s+den\s+mail\s+\S+/i, "")
    .replace(/\s+đến\s+\S+@\S+/i, "")
    .replace(/\s+den\s+\S+@\S+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectFor(intent, urgent, topic, explicitSubject) {
  if (clean(explicitSubject)) return clean(explicitSubject);
  if (intent === "meeting_request") {
    return urgent
      ? "Đề nghị tham dự cuộc họp khẩn cấp"
      : "Đề nghị tham dự cuộc họp";
  }
  if (intent === "deadline_reminder") return urgent ? "Nhắc hạn xử lý nhiệm vụ khẩn" : "Nhắc hạn xử lý nhiệm vụ";
  if (intent === "report_request") return "Đề nghị cung cấp báo cáo";
  if (intent === "response_request") return "Đề nghị phản hồi nội dung công việc";
  return topic ? `Trao đổi công việc: ${topic}` : "Trao đổi nội dung công việc";
}

function greeting(recipient) {
  const target = clean(recipient);
  if (target) return `Kính gửi ${target},`;
  return "Kính gửi Anh/Chị,";
}

function composeBody({ request, recipient, sender, deadline, time, location }) {
  const intent = detectIntent(request);
  const urgent = detectUrgency(request);
  const topic = stripCommandWords(request);
  const lines = [greeting(recipient), ""];

  if (intent === "meeting_request") {
    const meetingTopic = urgent ? "cuộc họp khẩn cấp" : (topic || "cuộc họp");
    lines.push(
      urgent
        ? "Tôi gửi email này để đề nghị Anh/Chị tham dự cuộc họp khẩn cấp nhằm trao đổi và thống nhất phương án xử lý công việc phát sinh."
        : "Tôi gửi email này để đề nghị Anh/Chị tham dự cuộc họp nhằm trao đổi và thống nhất các nội dung công việc liên quan.",
      "",
      "Nội dung dự kiến:",
      `- Trao đổi về ${meetingTopic}.`,
      "- Làm rõ tình hình, vướng mắc và phương án triển khai.",
      "- Thống nhất đầu mối thực hiện, thời hạn hoàn thành và các bước tiếp theo.",
    );
    if (clean(time)) lines.push(`- Thời gian: ${clean(time)}.`);
    if (clean(location)) lines.push(`- Địa điểm/hình thức: ${clean(location)}.`);
    lines.push(
      "",
      "Đề nghị Anh/Chị xác nhận khả năng tham dự và chuẩn bị các thông tin, tài liệu liên quan để cuộc họp đạt hiệu quả.",
    );
  } else if (intent === "deadline_reminder") {
    lines.push(
      "Tôi gửi email này để nhắc Anh/Chị về nhiệm vụ cần tiếp tục theo dõi và hoàn thành đúng thời hạn.",
      "",
      "Nội dung cần thực hiện:",
      `- ${sentence(topic || "Rà soát và xử lý nội dung công việc được giao")}`,
    );
    if (clean(deadline)) lines.push(`- Thời hạn hoàn thành: ${clean(deadline)}.`);
    lines.push(
      "",
      "Đề nghị Anh/Chị cập nhật tiến độ thực hiện và phản hồi nếu có khó khăn, vướng mắc cần phối hợp xử lý.",
    );
  } else if (intent === "report_request") {
    lines.push(
      "Tôi gửi email này để đề nghị Anh/Chị phối hợp cung cấp thông tin, số liệu phục vụ công tác tổng hợp báo cáo.",
      "",
      "Nội dung đề nghị cung cấp:",
      `- ${sentence(topic || "Thông tin, số liệu và tài liệu liên quan")}`,
    );
    if (clean(deadline)) lines.push(`- Thời hạn gửi lại: ${clean(deadline)}.`);
    lines.push("", "Đề nghị Anh/Chị gửi phản hồi đúng thời hạn để bảo đảm tiến độ tổng hợp chung.");
  } else {
    lines.push(
      "Tôi gửi email này để trao đổi và đề nghị Anh/Chị phối hợp xử lý nội dung công việc sau:",
      "",
      `- ${sentence(topic || "Nội dung công việc cần được rà soát, phản hồi và phối hợp xử lý")}`,
    );
    if (clean(deadline)) lines.push(`- Thời hạn phản hồi: ${clean(deadline)}.`);
    lines.push("", "Đề nghị Anh/Chị xem xét, phản hồi và phối hợp thực hiện theo chức năng, nhiệm vụ được giao.");
  }

  lines.push("", "Trân trọng,");
  if (clean(sender)) lines.push(clean(sender));
  return lines.join("\n");
}

function main() {
  if (args.help) {
    console.log("Usage: node scripts/email-composer.js --request text [--to email] [--recipient name] [--sender name] [--subject text] [--deadline text] [--time text] [--location text]");
    return;
  }
  try {
    const request = clean(args.request);
    if (!request) throw new Error("--request is required");
    const intent = detectIntent(request);
    const urgent = detectUrgency(request);
    const topic = stripCommandWords(request);
    const subject = subjectFor(intent, urgent, topic, args.subject);
    const body = composeBody({
      request,
      recipient: args.recipient,
      sender: args.sender,
      deadline: args.deadline,
      time: args.time,
      location: args.location,
    });
    printEnvelope(SKILL, {
      action: "composed",
      email: {
        to: clean(args.to) || null,
        subject,
        body,
      },
      meta: {
        intent,
        urgent,
        topic: topic || null,
        style: "hanh-chinh-van-phong",
        language: "vi",
      },
    });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
