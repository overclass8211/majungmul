/* ============================================================
 * API 단위/통합 테스트 (node:test 내장 러너 사용 — 추가 의존성 없음)
 * ------------------------------------------------------------
 * 실행: npm test
 * 커밋 전 반드시 통과해야 합니다. (기능 안정성 / 데이터 무결성 확인)
 *
 * 검증 항목
 *  1. 정적 프론트엔드 서빙 (200)
 *  2. 사역 요청 접수 (POST /api/requests) 및 필수값 검증 (400)
 *  3. 비관리자 조회 시 개인정보 마스킹
 *  4. 관리자 로그인 성공/실패
 *  5. 관리자 원본 조회 및 상태 변경(PUT)
 *  6. 무권한 저장 차단 (403)
 *  7. 존재하지 않는 컬렉션 차단 (404)
 * ============================================================ */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "test-password-123";
let proc, tmpData;

/* 테스트 전: 임시 데이터 폴더로 서버 기동 (운영 data/ 오염 방지) */
before(async () => {
  tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "mjm-test-"));
  proc = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, ADMIN_PASSWORD: PASSWORD, DATA_DIR: tmpData },
    stdio: "ignore",
  });
  /* 서버 준비될 때까지 대기 */
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("테스트 서버 기동 실패");
});

after(() => {
  proc?.kill();
  fs.rmSync(tmpData, { recursive: true, force: true });
});

test("1. 정적 프론트엔드가 서빙된다", async () => {
  const r = await fetch(BASE + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /마중물/);
});

test("2. 접수 필수값 누락 시 400을 반환한다", async () => {
  const r = await fetch(BASE + "/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ church: "필수값누락교회" }),
  });
  assert.equal(r.status, 400);
});

test("3. 정상 접수 후 비관리자 조회 시 개인정보가 마스킹된다", async () => {
  const r = await fetch(BASE + "/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      church: "은혜교회", date: "2026-09-01", people: "40",
      contactName: "홍길동", contactPhone: "010-1234-5678",
      purpose: "부흥회", songs: "은혜 아니면",
    }),
  });
  assert.equal(r.status, 200);

  const list = await (await fetch(BASE + "/api/data/requests")).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].contactName, "홍**");
  assert.equal(list[0].contactPhone, "010-****-5678");
  assert.equal(list[0].status, "waiting");
});

test("4. 잘못된 비밀번호는 401, 올바르면 토큰이 발급된다", async () => {
  const bad = await fetch(BASE + "/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(bad.status, 401);

  const ok = await fetch(BASE + "/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(ok.status, 200);
  const { token } = await ok.json();
  assert.ok(token?.length > 20);
  globalThis.__token = token;
});

test("5. 관리자는 원본 조회 및 상태 변경이 가능하다", async () => {
  const h = { "x-admin-token": globalThis.__token };
  const list = await (await fetch(BASE + "/api/data/requests", { headers: h })).json();
  assert.equal(list[0].contactName, "홍길동");
  assert.equal(list[0].contactPhone, "010-1234-5678");

  list[0].status = "progress";
  const put = await fetch(BASE + "/api/data/requests", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...h },
    body: JSON.stringify(list),
  });
  assert.equal(put.status, 200);

  /* 데이터 무결성: 저장 후 재조회 값이 일치해야 함 */
  const again = await (await fetch(BASE + "/api/data/requests", { headers: h })).json();
  assert.equal(again[0].status, "progress");
});

test("6. 토큰 없는 저장 요청은 403으로 차단된다", async () => {
  const r = await fetch(BASE + "/api/data/members", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([]),
  });
  assert.equal(r.status, 403);
});

test("7. 허용되지 않은 컬렉션은 404를 반환한다", async () => {
  const r = await fetch(BASE + "/api/data/hacked");
  assert.equal(r.status, 404);
});

test("8. playlist 컬렉션: 공개 조회 가능, 관리자만 저장 가능", async () => {
  /* 공개 조회 */
  const pub = await fetch(BASE + "/api/data/playlist");
  assert.equal(pub.status, 200);
  assert.deepEqual(await pub.json(), []);

  /* 무권한 저장 차단 */
  const denied = await fetch(BASE + "/api/data/playlist", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ id: 1, title: "test", url: "https://youtu.be/abcdefghijk" }]),
  });
  assert.equal(denied.status, 403);

  /* 관리자 저장 → 재조회 시 데이터 무결성 확인 */
  const h = { "Content-Type": "application/json", "x-admin-token": globalThis.__token };
  const put = await fetch(BASE + "/api/data/playlist", {
    method: "PUT", headers: h,
    body: JSON.stringify([{ id: 1, title: "은혜 아니면", url: "https://youtu.be/abcdefghijk" }]),
  });
  assert.equal(put.status, 200);
  const saved = await (await fetch(BASE + "/api/data/playlist")).json();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, "은혜 아니면");
});

test("9. 배포 웹훅: 시크릿 미설정 시 503, 잘못된 서명은 401", async () => {
  /* 테스트 서버는 DEPLOY_SECRET 없이 기동됨 → 503 */
  const off = await fetch(BASE + "/api/deploy/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(off.status, 503);
});

test("10. 배포 웹훅: 시크릿 설정 시 서명 검증이 동작한다", async () => {
  /* 시크릿을 설정한 별도 서버로 검증 (포트 3198) */
  const { spawn } = require("node:child_process");
  const crypto = require("node:crypto");
  const SECRET = "hook-secret-test";
  const p = spawn("node", ["server.js"], {
    env: { ...process.env, PORT: 3198, ADMIN_PASSWORD: "x", DATA_DIR: tmpData, DEPLOY_SECRET: SECRET },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 30; i++) {
      try { if ((await fetch("http://127.0.0.1:3198/")).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    /* 잘못된 서명 → 401 */
    const bad = await fetch("http://127.0.0.1:3198/api/deploy/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) },
      body: "{}",
    });
    assert.equal(bad.status, 401);

    /* 올바른 서명 → 200 (배포 시작 응답) */
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    const ok = await fetch("http://127.0.0.1:3198/api/deploy/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": sig },
      body,
    });
    assert.equal(ok.status, 200);
  } finally {
    p.kill();
  }
});
