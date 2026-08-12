/* ============================================================
 * 마중물 MINISTRY - 웹/API 서버
 * ------------------------------------------------------------
 * - 정적 프론트엔드(public/) 서빙 + REST API 제공
 * - 데이터는 data/*.json 파일에 저장 (DB 설치 불필요)
 * - 포트는 환경변수 PORT로 제어 (기본 3100)
 *   → 기존 oci-crm(80/443) 서비스와 물리적으로 분리됨
 * - 관리자 비밀번호는 환경변수 ADMIN_PASSWORD로 제어
 * ============================================================ */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3100;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "majungmul!"; // 배포 후 반드시 변경
const DEPLOY_SECRET = process.env.DEPLOY_SECRET || ""; // 설정 시 자동배포 웹훅 활성화
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

/* 허용된 컬렉션만 파일로 저장 (임의 경로 접근 차단) */
const COLLECTIONS = ["members", "journey", "contents", "requests", "playlist"];

const app = express();

/* ============================================================
 * 자동배포 웹훅 (GitHub → 이 서버)
 * ------------------------------------------------------------
 * 흐름: GitHub push 발생 → 이 엔드포인트 호출(HMAC 서명 검증)
 *       → git pull → npm test → 전부 통과 시 프로세스 종료
 *       → systemd(Restart=always)가 새 코드로 자동 재기동
 *       → 테스트 실패 시 기존 버전 유지 (안전장치)
 * 주의: express.json 보다 먼저 등록해야 원본 바디로 서명 검증 가능
 * ============================================================ */
const { execFile } = require("child_process");
let deploying = false; // 중복 배포 방지

app.post(
  "/api/deploy/webhook",
  express.raw({ type: "*/*", limit: "2mb" }),
  (req, res) => {
    if (!DEPLOY_SECRET)
      return res.status(503).json({ error: "자동배포가 설정되지 않았습니다. (DEPLOY_SECRET 미설정)" });

    /* GitHub HMAC-SHA256 서명 검증 */
    const sig = req.get("x-hub-signature-256") || "";
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", DEPLOY_SECRET).update(req.body).digest("hex");
    const valid =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!valid) return res.status(401).json({ error: "서명이 올바르지 않습니다." });

    if (deploying) return res.json({ ok: true, msg: "이미 배포 진행 중" });
    deploying = true;
    res.json({ ok: true, msg: "배포 시작: pull → test → restart" });

    /* 응답 후 비동기로 배포 수행 */
    const log = (m) => console.log(`[deploy] ${m}`);
    execFile("git", ["pull", "--ff-only"], { cwd: __dirname }, (e, out) => {
      if (e) { log(`git pull 실패: ${e.message}`); deploying = false; return; }
      log(`git pull 완료: ${out.trim().split("\n")[0]}`);
      execFile("npm", ["test"], { cwd: __dirname, timeout: 120000 }, (e2, out2) => {
        if (e2) {
          log("npm test 실패 → 기존 버전 유지 (재시작 안 함)");
          log(out2?.slice(-500) || e2.message);
          deploying = false;
          return;
        }
        log("테스트 전체 통과 → 새 코드로 재시작합니다");
        setTimeout(() => process.exit(0), 500); // systemd가 자동 재기동
      });
    });
  }
);

app.use(express.json({ limit: "15mb" })); // base64 이미지 포함 저장 허용

/* ---------- 파일 저장소 헬퍼 ---------- */
function colPath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}
function readCol(name) {
  try {
    return JSON.parse(fs.readFileSync(colPath(name), "utf8"));
  } catch {
    return []; // 파일이 없으면 빈 배열
  }
}
function writeCol(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  /* 원자적 쓰기: 임시파일에 쓴 뒤 rename → 저장 중 크래시에도 파일 무결성 유지 */
  const tmp = colPath(name) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, colPath(name));
}

/* ---------- 관리자 토큰 (간단한 세션) ---------- */
const adminTokens = new Set();
function isAdminReq(req) {
  const token = req.get("x-admin-token");
  return token && adminTokens.has(token);
}

/* 관리자 로그인: 성공 시 토큰 발급 */
app.post("/api/admin/login", (req, res) => {
  if (req.body?.password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString("hex");
    adminTokens.add(token);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: "비밀번호가 올바르지 않습니다." });
});

/* ---------- 데이터 API ---------- */
/* 컬렉션 이름 검증 미들웨어 */
app.param("col", (req, res, next, col) => {
  if (!COLLECTIONS.includes(col))
    return res.status(404).json({ error: "존재하지 않는 컬렉션입니다." });
  next();
});

/* 조회: 누구나 가능. 단 requests는 비관리자에게 개인정보 마스킹 후 반환 */
app.get("/api/data/:col", (req, res) => {
  let data = readCol(req.params.col);
  if (req.params.col === "requests" && !isAdminReq(req)) {
    data = data.map((r) => ({
      ...r,
      contactName: maskName(r.contactName),
      contactPhone: maskPhone(r.contactPhone),
    }));
  }
  res.json(data);
});

/* 사역 요청 접수: 누구나 가능 (공개 폼) */
app.post("/api/requests", (req, res) => {
  const b = req.body || {};
  if (!b.church || !b.date || !b.contactName || !b.contactPhone)
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  const data = readCol("requests");
  const item = {
    id: Date.now(),
    church: String(b.church).slice(0, 100),
    people: String(b.people || "").slice(0, 10),
    date: String(b.date).slice(0, 20),
    address: String(b.address || "").slice(0, 200),
    contactName: String(b.contactName).slice(0, 50),
    contactPhone: String(b.contactPhone).slice(0, 30),
    purpose: String(b.purpose || "").slice(0, 1000),
    songs: String(b.songs || "").slice(0, 500),
    status: "waiting",
    created: new Date().toISOString(),
  };
  data.unshift(item);
  writeCol("requests", data);
  res.json({ ok: true, id: item.id });
});

/* 컬렉션 전체 저장(등록/삭제/상태변경): 관리자 전용 */
app.put("/api/data/:col", (req, res) => {
  if (!isAdminReq(req))
    return res.status(403).json({ error: "관리자 권한이 필요합니다." });
  if (!Array.isArray(req.body))
    return res.status(400).json({ error: "배열 형식이어야 합니다." });
  writeCol(req.params.col, req.body);
  res.json({ ok: true });
});

/* ---------- 마스킹 유틸 (서버측에서도 동일 적용) ---------- */
const maskName = (n) => (n ? n[0] + "*".repeat(Math.max(n.length - 1, 1)) : "");
const maskPhone = (p) =>
  p ? p.replace(/(\d{2,3})[-\s]?(\d{3,4})[-\s]?(\d{4})/, "$1-****-$3") : "";

/* ---------- 정적 프론트엔드 ---------- */
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(PORT, () => {
  console.log(`마중물 MINISTRY 서버 실행 중 → http://0.0.0.0:${PORT}`);
});
