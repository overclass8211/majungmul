import React, { useState, useEffect, useRef } from "react";
import {
  Droplet, Droplets, Users, Map, Film, Send, Inbox, Menu, X, Plus,
  Trash2, Lock, Unlock, CheckCircle2, Clock, Loader2, Music, Phone,
  MapPin, CalendarDays, Church, Camera, PlayCircle, Heart, ChevronRight,
  Waves, Shield, Image as ImageIcon,
} from "lucide-react";

/* ============================================================
   마중물 MINISTRY 홈페이지
   ------------------------------------------------------------
   구성 (SPA 탭 방식)
   1) 사역 소개   : 비전 / PREPARE·REVIVE·REJOICE / 후원 안내
   2) 섬기는 이   : 멤버 등록·삭제 (프로필 사진 업로드 포함)
   3) 사역 여정   : 보드판 형식 사역일지 게시판
   4) 사역 콘텐츠 : 영상(YouTube)·포토 게시판
   5) 사역 요청   : 접수 폼 → [사역 접수신청] 게시판 자동 등록
   6) 접수 현황   : 공개 게시판(개인정보 마스킹) + 관리자 상태관리
   ------------------------------------------------------------
   데이터는 window.storage(키-값 저장소)에 보관되어
   새로고침/재접속 후에도 유지됩니다.
   관리자 기본 비밀번호: majungmul!  (코드 상단에서 변경 가능)
   ============================================================ */

/* ---------- 서버 API 헬퍼 ----------
 * 데이터는 동일 서버의 /api 로 저장·조회됩니다.
 * 관리자 토큰은 로그인 성공 시 localStorage에 보관됩니다.
 */
const getToken = () => localStorage.getItem("mjm_admin_token") || "";
const authHeaders = () => {
  const t = getToken();
  return t ? { "x-admin-token": t } : {};
};

async function loadCol(key, fallback = []) {
  try {
    const r = await fetch(`/api/data/${key}`, { headers: authHeaders() });
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    return fallback;
  }
}

/* 관리자 전용 저장 (등록/삭제/상태변경) */
async function saveCol(key, data) {
  try {
    const r = await fetch(`/api/data/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error);
  } catch (e) {
    console.error("저장 실패:", e);
    alert(e.message || "저장에 실패했습니다. 관리자 로그인 상태를 확인해 주세요.");
  }
}

/* 공개 접수 폼 전송 */
async function submitRequest(form) {
  const r = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  if (!r.ok) throw new Error((await r.json()).error || "접수에 실패했습니다.");
}

/* 관리자 로그인: 서버 검증 후 토큰 저장 */
async function adminLogin(password) {
  const r = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) return false;
  const { token } = await r.json();
  localStorage.setItem("mjm_admin_token", token);
  return true;
}
function adminLogout() {
  localStorage.removeItem("mjm_admin_token");
}

/* ---------- 이미지 리사이즈: 저장 용량 절약 (긴 변 560px) ---------- */
function fileToResizedDataURL(file, maxSize = 560, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- YouTube URL → embed ID ---------- */
function youtubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
}

/* ---------- 접수 상태 정의 ---------- */
const STATUS = {
  waiting: { label: "접수 대기", color: "#8FA8BC", icon: Clock },
  received: { label: "접수 처리", color: "#3E86C0", icon: Inbox },
  progress: { label: "진행 중", color: "#1E5A8A", icon: Loader2 },
  done: { label: "완료", color: "#2BA47A", icon: CheckCircle2 },
};

/* 개인정보 마스킹은 server.js 에서 처리됨 (비관리자 응답 시 자동 적용) */

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

/* ============================================================
   공용 소품
   ============================================================ */
const RIPPLE_STEPS = [
  { en: "PREPARE", ko: "준비하는 마중물" },
  { en: "REVIVE", ko: "흐르게 하는 마중물" },
  { en: "REJOICE", ko: "함께 기뻐하는 마중물" },
];

function SectionTitle({ eyebrow, title, sub }) {
  return (
    <div className="section-head">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="brush">{title}</h2>
      {sub && <p className="section-sub">{sub}</p>}
    </div>
  );
}

function Empty({ icon: Icon, text }) {
  return (
    <div className="empty">
      <Icon size={34} strokeWidth={1.4} />
      <p>{text}</p>
    </div>
  );
}

/* ============================================================
   1. 사역 소개 (홈)
   ============================================================ */
function AboutPage({ go }) {
  return (
    <>
      {/* ── 히어로: 물방울 파문 시그니처 ── */}
      <section className="hero">
        <div className="hero-ripples" aria-hidden>
          <span /><span /><span /><span />
          <Droplet className="hero-drop" size={44} strokeWidth={1.3} />
        </div>
        <p className="hero-eyebrow">MAJUNGMUL&nbsp;&nbsp;MINISTRY</p>
        <h1 className="brush hero-title">마중물</h1>
        <p className="hero-copy">
          우리는 <b>예배의 마중물</b>이 되어
          <br />
          교회 안의 <b>예배</b>가 다시 흐르게 합니다
        </p>
        <p className="hero-tag">한 바가지의 물이, 큰 흐름을 만듭니다</p>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => go("request")}>
            찬양집회 요청하기 <ChevronRight size={16} />
          </button>
          <button className="btn ghost" onClick={() => go("journey")}>
            사역 여정 보기
          </button>
        </div>
      </section>

      {/* ── PREPARE → REVIVE → REJOICE 흐름 바 ── */}
      <section className="flowbar">
        {RIPPLE_STEPS.map((s, i) => (
          <React.Fragment key={s.en}>
            <div className="flow-item">
              <Droplet size={18} />
              <div>
                <b>{s.en}</b>
                <span>{s.ko}</span>
              </div>
            </div>
            {i < 2 && <ChevronRight className="flow-arrow" size={18} />}
          </React.Fragment>
        ))}
      </section>

      {/* ── 세 가지 가치 ── */}
      <section className="wrap">
        <SectionTitle
          eyebrow="OUR VISION"
          title="마중물이 하는 일"
          sub="펌프에서 물을 끌어올리기 위해 먼저 붓는 한 바가지의 물, 그것이 마중물입니다."
        />
        <div className="cards3">
          <article className="value-card">
            <div className="value-ico"><Droplet size={22} /></div>
            <h3>마중물</h3>
            <p>작은 순종의 한 걸음이 큰 변화를 만듭니다. 우리는 먼저 부어지는 물이 되기를 자원합니다.</p>
          </article>
          <article className="value-card">
            <div className="value-ico"><Waves size={22} /></div>
            <h3>예배의 회복</h3>
            <p>멈추었던 예배가 다시 흐르게 됩니다. 미자립교회와 작은 공동체의 예배 곁에 서겠습니다.</p>
          </article>
          <article className="value-card">
            <div className="value-ico"><Users size={22} /></div>
            <h3>함께하는 섬김</h3>
            <p>우리가 함께할 때 하나님의 일하심이 일어납니다. 찬양으로 연합하고, 기도로 동행합니다.</p>
          </article>
        </div>
      </section>

      {/* ── 사역 안내 ── */}
      <section className="wrap">
        <SectionTitle eyebrow="MINISTRY" title="이렇게 섬깁니다" />
        <div className="cards2">
          <article className="info-card">
            <Music size={20} />
            <div>
              <h4>찾아가는 찬양집회</h4>
              <p>예배팀이 없는 미자립교회·기관·단체를 직접 찾아가 찬양예배를 함께 드립니다. 음향·악기 셋업부터 인도까지 한 팀으로 섬깁니다.</p>
            </div>
          </article>
          <article className="info-card">
            <Heart size={20} />
            <div>
              <h4>예배자 세우기</h4>
              <p>지역 교회의 예배자들이 스스로 예배를 이어갈 수 있도록 찬양팀 훈련과 워크숍을 나눕니다. 마중물이 떠난 뒤에도 물이 흐르도록.</p>
            </div>
          </article>
        </div>
      </section>

      {/* ── 후원 안내 ── */}
      <section className="wrap">
        <div className="donate">
          <div>
            <span className="eyebrow light">WITH US</span>
            <h3 className="brush">함께 물을 길어주세요</h3>
            <p>
              마중물 미니스트리는 후원과 기도로 운영됩니다.
              <br />
              악기·음향 장비 유지와 이동 사역비로 소중히 사용됩니다.
            </p>
          </div>
          <div className="donate-box">
            <b>후원 계좌</b>
            <p>OO은행 000-0000-0000 (마중물미니스트리)</p>
            <b>기도 제목</b>
            <p>예배가 멈춘 교회들이 다시 노래하게 되도록</p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   2. 섬기는 이 — 멤버 등록/삭제 + 프로필 이미지
   ============================================================ */
function MembersPage({ isAdmin }) {
  const [members, setMembers] = useState(null);
  const [form, setForm] = useState({ name: "", role: "", intro: "", photo: null });
  const [open, setOpen] = useState(false);
  const fileRef = useRef();

  useEffect(() => { loadCol("members").then(setMembers); }, []);

  const addMember = async () => {
    if (!form.name.trim() || !form.role.trim())
      return alert("이름과 역할을 입력해 주세요.");
    const next = [
      ...members,
      { id: Date.now(), ...form, name: form.name.trim(), role: form.role.trim() },
    ];
    setMembers(next);
    await saveCol("members", next);
    setForm({ name: "", role: "", intro: "", photo: null });
    setOpen(false);
  };

  const removeMember = async (id) => {
    if (!confirm("이 멤버를 삭제할까요?")) return;
    const next = members.filter((m) => m.id !== id);
    setMembers(next);
    await saveCol("members", next);
  };

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (f) setForm({ ...form, photo: await fileToResizedDataURL(f, 480) });
  };

  if (!members) return <div className="loading"><Loader2 className="spin" /></div>;

  return (
    <section className="wrap">
      <SectionTitle
        eyebrow="PEOPLE"
        title="섬기는 이"
        sub="한 바가지의 물이 되기를 자원한 사람들입니다."
      />

      {isAdmin && (
        <div className="admin-strip">
          <Shield size={15} /> 관리자 모드
          <button className="btn small primary" onClick={() => setOpen(!open)}>
            <Plus size={15} /> 멤버 등록
          </button>
        </div>
      )}

      {open && (
        <div className="form-card">
          <div className="form-grid">
            <label>이름
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
            </label>
            <label>역할
              <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="찬양 인도 / 건반 / 드럼 …" />
            </label>
          </div>
          <label>소개
            <textarea rows={2} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} placeholder="한 줄 소개" />
          </label>
          <div className="photo-row">
            <button className="btn ghost small" onClick={() => fileRef.current.click()}>
              <Camera size={15} /> 프로필 사진
            </button>
            <input type="file" accept="image/*" hidden ref={fileRef} onChange={onPhoto} />
            {form.photo && <img src={form.photo} alt="미리보기" className="photo-preview" />}
          </div>
          <div className="form-actions">
            <button className="btn ghost small" onClick={() => setOpen(false)}>취소</button>
            <button className="btn primary small" onClick={addMember}>등록하기</button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <Empty icon={Users} text={isAdmin ? "첫 멤버를 등록해 주세요." : "멤버 소개를 준비 중입니다."} />
      ) : (
        <div className="member-grid">
          {members.map((m) => (
            <article key={m.id} className="member-card">
              <div className="member-photo">
                {m.photo ? <img src={m.photo} alt={m.name} /> : <Droplet size={26} strokeWidth={1.3} />}
              </div>
              <h4>{m.name}</h4>
              <span className="member-role">{m.role}</span>
              {m.intro && <p>{m.intro}</p>}
              {isAdmin && (
                <button className="icon-del" title="삭제" onClick={() => removeMember(m.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   3. 사역 여정 — 보드판 형식 사역일지
   ============================================================ */
function JourneyPage({ isAdmin }) {
  const [posts, setPosts] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", place: "", title: "", body: "" });

  useEffect(() => { loadCol("journey").then(setPosts); }, []);

  const addPost = async () => {
    if (!form.title.trim()) return alert("제목을 입력해 주세요.");
    const next = [{ id: Date.now(), ...form, created: new Date().toISOString() }, ...posts];
    setPosts(next);
    await saveCol("journey", next);
    setForm({ date: "", place: "", title: "", body: "" });
    setOpen(false);
  };

  const removePost = async (id) => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    const next = posts.filter((p) => p.id !== id);
    setPosts(next);
    await saveCol("journey", next);
  };

  if (!posts) return <div className="loading"><Loader2 className="spin" /></div>;

  return (
    <section className="wrap">
      <SectionTitle
        eyebrow="JOURNEY"
        title="사역 여정"
        sub="마중물이 흘러간 자리들의 기록입니다."
      />

      {isAdmin && (
        <div className="admin-strip">
          <Shield size={15} /> 관리자 모드
          <button className="btn small primary" onClick={() => setOpen(!open)}>
            <Plus size={15} /> 사역일지 쓰기
          </button>
        </div>
      )}

      {open && (
        <div className="form-card">
          <div className="form-grid">
            <label>사역일
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>장소
              <input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="OO교회, OO센터 …" />
            </label>
          </div>
          <label>제목
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예) 봄비 같은 찬양집회" />
          </label>
          <label>내용
            <textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="그날의 은혜와 기록을 남겨주세요." />
          </label>
          <div className="form-actions">
            <button className="btn ghost small" onClick={() => setOpen(false)}>취소</button>
            <button className="btn primary small" onClick={addPost}>기록 남기기</button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <Empty icon={Map} text="아직 기록된 여정이 없습니다. 첫 물줄기를 기다리고 있어요." />
      ) : (
        <div className="board">
          {posts.map((p) => (
            <article key={p.id} className="board-card">
              <div className="board-meta">
                <span className="pin"><Droplet size={12} /></span>
                {p.date && <span><CalendarDays size={13} /> {fmtDate(p.date)}</span>}
                {p.place && <span><MapPin size={13} /> {p.place}</span>}
              </div>
              <h4>{p.title}</h4>
              {p.body && <p>{p.body}</p>}
              {isAdmin && (
                <button className="icon-del" onClick={() => removePost(p.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   4. 사역 콘텐츠 — 영상(YouTube) / 포토 게시판
   ============================================================ */
function ContentsPage({ isAdmin }) {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("all"); // all | video | photo
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "video", title: "", url: "", photo: null });
  const fileRef = useRef();

  useEffect(() => { loadCol("contents").then(setItems); }, []);

  const addItem = async () => {
    if (!form.title.trim()) return alert("제목을 입력해 주세요.");
    if (form.type === "video" && !youtubeId(form.url))
      return alert("올바른 YouTube 링크를 입력해 주세요.");
    if (form.type === "photo" && !form.photo)
      return alert("사진을 선택해 주세요.");
    const next = [{ id: Date.now(), ...form, created: new Date().toISOString() }, ...items];
    setItems(next);
    await saveCol("contents", next);
    setForm({ type: "video", title: "", url: "", photo: null });
    setOpen(false);
  };

  const removeItem = async (id) => {
    if (!confirm("이 콘텐츠를 삭제할까요?")) return;
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    await saveCol("contents", next);
  };

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (f) setForm({ ...form, photo: await fileToResizedDataURL(f, 720, 0.72) });
  };

  if (!items) return <div className="loading"><Loader2 className="spin" /></div>;
  const shown = items.filter((i) => tab === "all" || i.type === tab);

  return (
    <section className="wrap">
      <SectionTitle
        eyebrow="CONTENTS"
        title="사역 콘텐츠"
        sub="찬양사역의 순간들을 영상과 사진으로 나눕니다."
      />

      <div className="tabbar">
        {[["all", "전체"], ["video", "영상"], ["photo", "포토"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {isAdmin && (
        <div className="admin-strip">
          <Shield size={15} /> 관리자 모드
          <button className="btn small primary" onClick={() => setOpen(!open)}>
            <Plus size={15} /> 콘텐츠 올리기
          </button>
        </div>
      )}

      {open && (
        <div className="form-card">
          <div className="seg">
            <button className={form.type === "video" ? "on" : ""} onClick={() => setForm({ ...form, type: "video" })}>
              <PlayCircle size={15} /> 영상
            </button>
            <button className={form.type === "photo" ? "on" : ""} onClick={() => setForm({ ...form, type: "photo" })}>
              <ImageIcon size={15} /> 포토
            </button>
          </div>
          <label>제목
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예) OO교회 찬양집회 하이라이트" />
          </label>
          {form.type === "video" ? (
            <label>YouTube 링크
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://youtu.be/…" />
            </label>
          ) : (
            <div className="photo-row">
              <button className="btn ghost small" onClick={() => fileRef.current.click()}>
                <Camera size={15} /> 사진 선택
              </button>
              <input type="file" accept="image/*" hidden ref={fileRef} onChange={onPhoto} />
              {form.photo && <img src={form.photo} alt="미리보기" className="photo-preview wide" />}
            </div>
          )}
          <div className="form-actions">
            <button className="btn ghost small" onClick={() => setOpen(false)}>취소</button>
            <button className="btn primary small" onClick={addItem}>올리기</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <Empty icon={Film} text="아직 등록된 콘텐츠가 없습니다." />
      ) : (
        <div className="content-grid">
          {shown.map((c) => (
            <article key={c.id} className="content-card">
              {c.type === "video" ? (
                <div className="video-frame">
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId(c.url)}`}
                    title={c.title}
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              ) : (
                <img src={c.photo} alt={c.title} className="content-photo" />
              )}
              <div className="content-cap">
                <span className="ctag">{c.type === "video" ? "영상" : "포토"}</span>
                <h4>{c.title}</h4>
                {isAdmin && (
                  <button className="icon-del static" onClick={() => removeItem(c.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   5. 사역 요청 — 접수 폼
   ============================================================ */
const EMPTY_REQ = {
  church: "", people: "", date: "", address: "",
  contactName: "", contactPhone: "", purpose: "", songs: "",
};

function RequestPage({ go }) {
  const [form, setForm] = useState(EMPTY_REQ);
  const [sending, setSending] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.church.trim()) return alert("교회/단체명을 입력해 주세요.");
    if (!form.date) return alert("집회 요청일을 선택해 주세요.");
    if (!form.contactName.trim() || !form.contactPhone.trim())
      return alert("담당자 성함과 연락처를 입력해 주세요.");
    setSending(true);
    try {
      await submitRequest(form); // 서버가 검증 후 접수 게시판에 등록
      setForm(EMPTY_REQ);
      alert("접수가 완료되었습니다! [접수 현황]에서 진행 상태를 확인하실 수 있습니다.");
      go("board");
    } catch (e) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="wrap narrow">
      <SectionTitle
        eyebrow="REQUEST"
        title="사역 요청"
        sub="예배의 마중물이 필요한 교회와 공동체를 기다립니다. 아래 신청서를 작성해 주시면 접수 게시판에 등록되고, 확인 후 연락드립니다."
      />

      <div className="form-card standout">
        <div className="form-grid">
          <label><Church size={14} /> 교회/단체명 *
            <input value={form.church} onChange={set("church")} placeholder="OO교회" />
          </label>
          <label><Users size={14} /> 예상 인원수
            <input type="number" min="1" value={form.people} onChange={set("people")} placeholder="30" />
          </label>
          <label><CalendarDays size={14} /> 집회 요청일 *
            <input type="date" value={form.date} onChange={set("date")} />
          </label>
          <label><Phone size={14} /> 담당자 연락처 *
            <input value={form.contactPhone} onChange={set("contactPhone")} placeholder="010-0000-0000" />
          </label>
          <label>담당자 성함 *
            <input value={form.contactName} onChange={set("contactName")} placeholder="홍길동 전도사" />
          </label>
          <label><MapPin size={14} /> 주소
            <input value={form.address} onChange={set("address")} placeholder="집회 장소 주소" />
          </label>
        </div>
        <label>요청 목적
          <textarea rows={3} value={form.purpose} onChange={set("purpose")}
            placeholder="예) 부흥회 찬양 인도, 청년부 수련회, 지역 연합 예배 …" />
        </label>
        <label><Music size={14} /> 꼭 함께 하고 싶은 찬양곡
          <textarea rows={2} value={form.songs} onChange={set("songs")}
            placeholder="예) 은혜 아니면, 주님 다시 오실 때까지 …" />
        </label>
        <p className="privacy-note">
          <Shield size={13} /> 담당자 성함·연락처는 공개 게시판에서 마스킹 처리되며, 사역 연락 목적으로만 사용됩니다.
        </p>
        <button className="btn primary full" disabled={sending} onClick={submit}>
          {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />} 신청서 제출하기
        </button>
      </div>

      {/* ── 자주 묻는 질문 ── */}
      <div className="faq">
        <h3>자주 묻는 질문</h3>
        <details>
          <summary>사역 비용이 있나요?</summary>
          <p>마중물 미니스트리는 후원으로 운영되며, 미자립교회에는 비용 부담 없이 찾아갑니다. 형편에 따라 자율 후원으로 함께해 주시면 감사합니다.</p>
        </details>
        <details>
          <summary>음향 장비가 없는데 가능한가요?</summary>
          <p>가능합니다. 기본 음향과 악기를 팀이 준비해 갑니다. 신청서 '요청 목적'란에 현장 상황을 적어주시면 준비에 큰 도움이 됩니다.</p>
        </details>
        <details>
          <summary>신청 후 얼마나 걸리나요?</summary>
          <p>접수 확인 후 보통 3일 이내에 담당자 연락처로 연락드립니다. [접수 현황] 게시판에서 진행 상태를 확인하실 수 있습니다.</p>
        </details>
      </div>
    </section>
  );
}

/* ============================================================
   6. 접수 현황 게시판 + 관리자 상태 관리
   ============================================================ */
function BoardPage({ isAdmin }) {
  const [reqs, setReqs] = useState(null);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);

  /* 관리자 로그인 여부에 따라 마스킹/원본이 달라지므로 isAdmin 변경 시 재조회 */
  useEffect(() => { loadCol("requests").then(setReqs); }, [isAdmin]);

  const setStatus = async (id, status) => {
    const next = reqs.map((r) => (r.id === id ? { ...r, status } : r));
    setReqs(next);
    await saveCol("requests", next);
  };

  const removeReq = async (id) => {
    if (!confirm("이 접수 건을 삭제할까요?")) return;
    const next = reqs.filter((r) => r.id !== id);
    setReqs(next);
    await saveCol("requests", next);
  };

  if (!reqs) return <div className="loading"><Loader2 className="spin" /></div>;
  const shown = reqs.filter((r) => filter === "all" || r.status === filter);
  const counts = Object.fromEntries(
    Object.keys(STATUS).map((k) => [k, reqs.filter((r) => r.status === k).length])
  );

  return (
    <section className="wrap">
      <SectionTitle
        eyebrow="STATUS"
        title="사역 접수신청"
        sub="접수된 요청과 진행 상태를 투명하게 공유합니다. 개인정보는 마스킹되어 표시됩니다."
      />

      <div className="tabbar">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          전체 {reqs.length}
        </button>
        {Object.entries(STATUS).map(([k, v]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {v.label} {counts[k]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty icon={Inbox} text="해당 상태의 접수 건이 없습니다." />
      ) : (
        <div className="req-list">
          {shown.map((r) => {
            const st = STATUS[r.status] || STATUS.waiting;
            const Icon = st.icon;
            const open = openId === r.id;
            return (
              <article key={r.id} className="req-card">
                <button className="req-head" onClick={() => setOpenId(open ? null : r.id)}>
                  <span className="req-status" style={{ background: st.color }}>
                    <Icon size={12} /> {st.label}
                  </span>
                  <b>{r.church}</b>
                  <span className="req-date"><CalendarDays size={13} /> {fmtDate(r.date)}</span>
                </button>

                {open && (
                  <div className="req-body">
                    <dl>
                      <div><dt>인원수</dt><dd>{r.people ? `${r.people}명` : "-"}</dd></div>
                      <div><dt>주소</dt><dd>{r.address || "-"}</dd></div>
                      {/* 비관리자에게는 서버가 이미 마스킹된 값을 내려줌 */}
                      <div><dt>담당자</dt>
                        <dd>{r.contactName} / {r.contactPhone}</dd>
                      </div>
                      <div><dt>요청 목적</dt><dd>{r.purpose || "-"}</dd></div>
                      <div><dt>함께하고 싶은 찬양</dt><dd>{r.songs || "-"}</dd></div>
                      <div><dt>접수일</dt><dd>{fmtDate(r.created)}</dd></div>
                    </dl>

                    {isAdmin && (
                      <div className="req-admin">
                        <span><Shield size={13} /> 상태 변경</span>
                        {Object.entries(STATUS).map(([k, v]) => (
                          <button
                            key={k}
                            className={`chip ${r.status === k ? "on" : ""}`}
                            style={r.status === k ? { background: v.color } : {}}
                            onClick={() => setStatus(r.id, k)}
                          >
                            {v.label}
                          </button>
                        ))}
                        <button className="icon-del static" onClick={() => removeReq(r.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   앱 셸 — 내비게이션 / 관리자 로그인 / 라우팅
   ============================================================ */
const MENUS = [
  { key: "about", label: "사역 소개", icon: Droplets },
  { key: "members", label: "섬기는 이", icon: Users },
  { key: "journey", label: "사역 여정", icon: Map },
  { key: "contents", label: "사역 콘텐츠", icon: Film },
  { key: "request", label: "사역 요청", icon: Send },
  { key: "board", label: "접수 현황", icon: Inbox },
];

export default function App() {
  const [page, setPage] = useState("about");
  const [nav, setNav] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => !!getToken()); // 토큰이 있으면 유지
  const [askPw, setAskPw] = useState(false);
  const [pw, setPw] = useState("");

  const go = (p) => { setPage(p); setNav(false); window.scrollTo(0, 0); };

  const tryLogin = async () => {
    if (await adminLogin(pw)) {
      setIsAdmin(true); setAskPw(false); setPw("");
    } else alert("비밀번호가 올바르지 않습니다.");
  };

  const logout = () => { adminLogout(); setIsAdmin(false); };

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* ── 상단 내비게이션 ── */}
      <header className="topnav">
        <button className="logo" onClick={() => go("about")}>
          <span className="logo-mark"><Droplet size={16} /></span>
          <span className="brush logo-text">마중물</span>
          <span className="logo-sub">MINISTRY</span>
        </button>

        <nav className={`menu ${nav ? "open" : ""}`}>
          {MENUS.map((m) => (
            <button key={m.key} className={page === m.key ? "on" : ""} onClick={() => go(m.key)}>
              <m.icon size={15} /> {m.label}
            </button>
          ))}
        </nav>

        <div className="nav-right">
          <button
            className={`adminbtn ${isAdmin ? "on" : ""}`}
            title={isAdmin ? "관리자 로그아웃" : "관리자 로그인"}
            onClick={() => (isAdmin ? logout() : setAskPw(true))}
          >
            {isAdmin ? <Unlock size={15} /> : <Lock size={15} />}
          </button>
          <button className="hamburger" onClick={() => setNav(!nav)}>
            {nav ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* ── 관리자 로그인 모달 ── */}
      {askPw && (
        <div className="modal-bg" onClick={() => setAskPw(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h4><Shield size={16} /> 관리자 로그인</h4>
            <input
              type="password"
              value={pw}
              autoFocus
              placeholder="비밀번호"
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryLogin()}
            />
            <div className="form-actions">
              <button className="btn ghost small" onClick={() => setAskPw(false)}>취소</button>
              <button className="btn primary small" onClick={tryLogin}>로그인</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 페이지 라우팅 ── */}
      <main>
        {page === "about" && <AboutPage go={go} />}
        {page === "members" && <MembersPage isAdmin={isAdmin} />}
        {page === "journey" && <JourneyPage isAdmin={isAdmin} />}
        {page === "contents" && <ContentsPage isAdmin={isAdmin} />}
        {page === "request" && <RequestPage go={go} />}
        {page === "board" && <BoardPage isAdmin={isAdmin} />}
      </main>

      {/* ── 푸터 ── */}
      <footer className="footer">
        <div className="footer-flow">
          {RIPPLE_STEPS.map((s, i) => (
            <span key={s.en}>
              <Droplet size={12} /> {s.en}{i < 2 && <ChevronRight size={12} />}
            </span>
          ))}
        </div>
        <p className="brush footer-brand">마중물 MINISTRY</p>
        <p>한 바가지의 물이, 큰 흐름을 만듭니다</p>
        <small>© {new Date().getFullYear()} Majungmul Ministry · majungmul@example.com</small>
      </footer>
    </div>
  );
}

/* ============================================================
   스타일 — 브랜드: 딥네이비 × 물빛 블루 × 캘리그래피
   ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nanum+Brush+Script&family=Noto+Sans+KR:wght@400;500;700&display=swap');

:root {
  --ink: #14304A;        /* 딥 네이비 */
  --tide: #1E5A8A;       /* 진한 물빛 */
  --water: #3E86C0;      /* 물빛 블루 */
  --mist: #DCEBF5;       /* 옅은 안개 */
  --paper: #F6FAFD;      /* 배경 */
  --white: #FFFFFF;
  --line: #D7E6F1;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
.app {
  font-family: 'Noto Sans KR', sans-serif;
  color: var(--ink);
  background: var(--paper);
  min-height: 100vh;
  display: flex; flex-direction: column;
  line-height: 1.65;
}
main { flex: 1; }
.brush { font-family: 'Nanum Brush Script', cursive; font-weight: 400; letter-spacing: 0.01em; }
button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
input, textarea {
  font-family: inherit; font-size: 0.92rem; color: var(--ink);
  border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 12px; width: 100%; background: var(--white);
}
input:focus, textarea:focus { outline: 2px solid var(--water); border-color: transparent; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; font-weight: 700; color: var(--tide); }
label svg { vertical-align: -2px; margin-right: 2px; }
:focus-visible { outline: 2px solid var(--water); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }

/* ── 상단 내비 ── */
.topnav {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 16px;
  padding: 10px 20px;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.logo { display: flex; align-items: baseline; gap: 7px; }
.logo-mark {
  width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center; align-self: center;
  background: linear-gradient(160deg, var(--water), var(--tide)); color: #fff;
}
.logo-text { font-size: 1.55rem; color: var(--ink); }
.logo-sub { font-size: 0.62rem; letter-spacing: 0.32em; color: var(--water); font-weight: 700; }
.menu { display: flex; gap: 2px; margin-left: auto; }
.menu button {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px;
  font-size: 0.86rem; font-weight: 500; color: #46617A;
}
.menu button:hover { background: var(--mist); }
.menu button.on { background: var(--ink); color: #fff; font-weight: 700; }
.nav-right { display: flex; align-items: center; gap: 6px; }
.adminbtn {
  width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center; color: #7C93A8;
  border: 1px solid var(--line);
}
.adminbtn.on { background: var(--tide); color: #fff; border-color: var(--tide); }
.hamburger { display: none; }

/* ── 히어로 ── */
.hero {
  position: relative; text-align: center;
  padding: 88px 20px 56px; overflow: hidden;
  background:
    radial-gradient(ellipse 90% 70% at 50% -10%, #E9F3FA 0%, transparent 60%),
    linear-gradient(180deg, #F0F7FC 0%, var(--paper) 100%);
}
.hero-ripples {
  position: relative; width: 130px; height: 130px; margin: 0 auto 18px;
  display: grid; place-items: center;
}
.hero-ripples span {
  position: absolute; inset: 0; border-radius: 50%;
  border: 1.5px solid var(--water); opacity: 0;
  animation: ripple 3.6s ease-out infinite;
}
.hero-ripples span:nth-child(2) { animation-delay: 0.9s; }
.hero-ripples span:nth-child(3) { animation-delay: 1.8s; }
.hero-ripples span:nth-child(4) { animation-delay: 2.7s; }
@keyframes ripple {
  0%   { transform: scale(0.3); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}
.hero-drop { color: var(--tide); filter: drop-shadow(0 4px 10px rgba(62,134,192,0.4)); }
.hero-eyebrow { letter-spacing: 0.5em; font-size: 0.68rem; font-weight: 700; color: var(--water); }
.hero-title { font-size: clamp(3.4rem, 9vw, 5.2rem); color: var(--ink); line-height: 1.05; margin: 6px 0 14px; }
.hero-copy { font-size: 1.05rem; color: #33506B; }
.hero-copy b { color: var(--tide); }
.hero-tag { margin-top: 10px; font-size: 0.82rem; color: #6E8AA3; letter-spacing: 0.06em; }
.hero-actions { display: flex; gap: 10px; justify-content: center; margin-top: 26px; flex-wrap: wrap; }

/* ── 버튼 ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 11px 20px; border-radius: 999px;
  font-size: 0.9rem; font-weight: 700;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.btn.primary { background: linear-gradient(150deg, var(--water), var(--tide)); color: #fff; box-shadow: 0 6px 16px rgba(30,90,138,0.28); }
.btn.primary:hover { transform: translateY(-1px); }
.btn.ghost { border: 1.5px solid var(--tide); color: var(--tide); background: #fff; }
.btn.small { padding: 7px 14px; font-size: 0.82rem; }
.btn.full { width: 100%; margin-top: 14px; }
.btn:disabled { opacity: 0.6; cursor: wait; }

/* ── 흐름 바 ── */
.flowbar {
  display: flex; align-items: center; justify-content: center; gap: 18px;
  flex-wrap: wrap; padding: 18px 20px;
  background: var(--ink); color: #fff;
}
.flow-item { display: flex; align-items: center; gap: 10px; }
.flow-item svg { color: #9CC8E8; }
.flow-item b { display: block; font-size: 0.8rem; letter-spacing: 0.22em; }
.flow-item span { display: block; font-size: 0.74rem; color: #A9C4DB; }
.flow-arrow { color: #567DA0; }

/* ── 레이아웃 ── */
.wrap { max-width: 1020px; margin: 0 auto; padding: 56px 20px; width: 100%; }
.wrap.narrow { max-width: 720px; }
.section-head { text-align: center; margin-bottom: 34px; }
.eyebrow { letter-spacing: 0.42em; font-size: 0.66rem; font-weight: 700; color: var(--water); }
.eyebrow.light { color: #9CC8E8; }
.section-head h2 { font-size: 2.5rem; margin-top: 4px; }
.section-sub { max-width: 560px; margin: 8px auto 0; font-size: 0.92rem; color: #55708A; }

/* ── 카드류 ── */
.cards3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.cards2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.value-card {
  background: #fff; border: 1px solid var(--line); border-radius: 18px;
  padding: 26px 22px; text-align: center;
}
.value-ico {
  width: 46px; height: 46px; margin: 0 auto 12px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--mist); color: var(--tide);
}
.value-card h3 { font-size: 1.05rem; margin-bottom: 6px; }
.value-card p { font-size: 0.86rem; color: #55708A; }
.info-card {
  display: flex; gap: 14px; background: #fff;
  border: 1px solid var(--line); border-radius: 18px; padding: 22px;
}
.info-card svg { color: var(--water); flex-shrink: 0; margin-top: 3px; }
.info-card h4 { font-size: 0.98rem; margin-bottom: 4px; }
.info-card p { font-size: 0.86rem; color: #55708A; }

/* ── 후원 ── */
.donate {
  display: grid; grid-template-columns: 1.2fr 1fr; gap: 26px; align-items: center;
  background: linear-gradient(140deg, var(--ink), var(--tide));
  color: #fff; border-radius: 22px; padding: 36px;
}
.donate h3 { font-size: 2.1rem; margin: 4px 0 10px; }
.donate p { font-size: 0.9rem; color: #C6DCEE; }
.donate-box {
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
  border-radius: 14px; padding: 20px; font-size: 0.88rem;
}
.donate-box b { display: block; color: #9CC8E8; font-size: 0.74rem; letter-spacing: 0.14em; margin-top: 10px; }
.donate-box b:first-child { margin-top: 0; }
.donate-box p { color: #fff; }

/* ── 관리자 스트립 / 폼 ── */
.admin-strip {
  display: flex; align-items: center; gap: 10px; margin-bottom: 18px;
  font-size: 0.8rem; font-weight: 700; color: var(--tide);
  background: var(--mist); border-radius: 12px; padding: 8px 14px;
}
.admin-strip .btn { margin-left: auto; }
.form-card {
  background: #fff; border: 1px solid var(--line); border-radius: 18px;
  padding: 22px; margin-bottom: 26px;
  display: flex; flex-direction: column; gap: 14px;
}
.form-card.standout { box-shadow: 0 14px 40px rgba(30,90,138,0.1); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.photo-row { display: flex; align-items: center; gap: 12px; }
.photo-preview { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid var(--mist); }
.photo-preview.wide { width: 90px; height: 60px; border-radius: 10px; }
.privacy-note { display: flex; align-items: center; gap: 6px; font-size: 0.76rem; color: #7C93A8; }
.seg { display: flex; gap: 6px; }
.seg button {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 999px; font-size: 0.84rem;
  border: 1px solid var(--line); color: #55708A;
}
.seg button.on { background: var(--ink); color: #fff; border-color: var(--ink); }

/* ── 멤버 ── */
.member-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; }
.member-card {
  position: relative; background: #fff; border: 1px solid var(--line);
  border-radius: 18px; padding: 24px 16px; text-align: center;
}
.member-photo {
  width: 84px; height: 84px; margin: 0 auto 12px; border-radius: 50%;
  overflow: hidden; display: grid; place-items: center;
  background: var(--mist); color: var(--water);
  border: 3px solid #EAF3FA;
}
.member-photo img { width: 100%; height: 100%; object-fit: cover; }
.member-card h4 { font-size: 1rem; }
.member-role { font-size: 0.76rem; font-weight: 700; color: var(--water); letter-spacing: 0.06em; }
.member-card p { font-size: 0.82rem; color: #55708A; margin-top: 8px; }
.icon-del {
  position: absolute; top: 10px; right: 10px;
  width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center;
  color: #B45A5A; background: #FBEFEF;
}
.icon-del.static { position: static; }

/* ── 보드판(사역 여정) ── */
.board { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.board-card {
  position: relative; background: #fff;
  border: 1px solid var(--line); border-left: 4px solid var(--water);
  border-radius: 14px; padding: 18px 18px 16px;
}
.board-meta { display: flex; align-items: center; gap: 12px; font-size: 0.76rem; color: #7C93A8; margin-bottom: 8px; flex-wrap: wrap; }
.board-meta span { display: inline-flex; align-items: center; gap: 4px; }
.pin { width: 22px; height: 22px; border-radius: 50%; background: var(--mist); color: var(--tide); display: grid; place-items: center; }
.board-card h4 { font-size: 1rem; margin-bottom: 6px; }
.board-card p { font-size: 0.86rem; color: #55708A; white-space: pre-wrap; }

/* ── 콘텐츠 ── */
.tabbar { display: flex; gap: 6px; justify-content: center; margin-bottom: 22px; flex-wrap: wrap; }
.tabbar button {
  padding: 7px 16px; border-radius: 999px; font-size: 0.84rem; font-weight: 500;
  border: 1px solid var(--line); color: #55708A; background: #fff;
}
.tabbar button.on { background: var(--tide); border-color: var(--tide); color: #fff; font-weight: 700; }
.content-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
.content-card { background: #fff; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
.video-frame { position: relative; padding-top: 56.25%; background: var(--ink); }
.video-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.content-photo { width: 100%; aspect-ratio: 16/10; object-fit: cover; display: block; }
.content-cap { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.ctag { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; color: var(--water); background: var(--mist); padding: 3px 9px; border-radius: 999px; }
.content-cap h4 { font-size: 0.92rem; flex: 1; }

/* ── 접수 현황 ── */
.req-list { display: flex; flex-direction: column; gap: 12px; }
.req-card { background: #fff; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.req-head {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 14px 16px; text-align: left; font-size: 0.92rem;
}
.req-head:hover { background: #FBFDFE; }
.req-head b { flex: 1; }
.req-status {
  display: inline-flex; align-items: center; gap: 5px;
  color: #fff; font-size: 0.72rem; font-weight: 700;
  padding: 4px 10px; border-radius: 999px;
}
.req-date { display: inline-flex; align-items: center; gap: 5px; font-size: 0.78rem; color: #7C93A8; }
.req-body { border-top: 1px solid var(--line); padding: 16px; background: #FBFDFE; }
.req-body dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
.req-body dt { font-size: 0.72rem; font-weight: 700; color: var(--water); letter-spacing: 0.06em; }
.req-body dd { font-size: 0.88rem; }
.req-admin {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line);
  font-size: 0.78rem; font-weight: 700; color: var(--tide);
}
.chip { padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); font-size: 0.76rem; color: #55708A; }
.chip.on { color: #fff; border-color: transparent; font-weight: 700; }

/* ── FAQ ── */
.faq { margin-top: 30px; }
.faq h3 { font-size: 1.05rem; margin-bottom: 12px; }
.faq details { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 13px 16px; margin-bottom: 8px; }
.faq summary { font-size: 0.9rem; font-weight: 700; cursor: pointer; color: var(--tide); }
.faq details p { margin-top: 8px; font-size: 0.86rem; color: #55708A; }

/* ── 기타 ── */
.empty {
  text-align: center; padding: 60px 20px; color: #8FA8BC;
  border: 1.5px dashed var(--line); border-radius: 18px; background: #FCFDFE;
}
.empty p { margin-top: 10px; font-size: 0.9rem; }
.loading { display: grid; place-items: center; padding: 80px; color: var(--water); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.modal-bg { position: fixed; inset: 0; z-index: 100; background: rgba(20,48,74,0.4); display: grid; place-items: center; padding: 20px; }
.modal { background: #fff; border-radius: 18px; padding: 24px; width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 14px; }
.modal h4 { display: flex; align-items: center; gap: 7px; font-size: 1rem; }

.footer { text-align: center; padding: 44px 20px 30px; background: var(--ink); color: #A9C4DB; }
.footer-flow { display: flex; justify-content: center; gap: 14px; font-size: 0.68rem; letter-spacing: 0.18em; margin-bottom: 14px; flex-wrap: wrap; }
.footer-flow span { display: inline-flex; align-items: center; gap: 5px; }
.footer-brand { font-size: 1.9rem; color: #fff; }
.footer p { font-size: 0.82rem; }
.footer small { display: block; margin-top: 14px; font-size: 0.72rem; color: #6E8AA3; }

/* ── 반응형 ── */
@media (max-width: 860px) {
  .cards3 { grid-template-columns: 1fr; }
  .cards2 { grid-template-columns: 1fr; }
  .donate { grid-template-columns: 1fr; }
  .hamburger { display: grid; place-items: center; width: 34px; height: 34px; }
  .menu {
    position: fixed; top: 55px; left: 0; right: 0;
    flex-direction: column; background: #fff; padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    transform: translateY(-130%); transition: transform 0.25s ease;
  }
  .menu.open { transform: translateY(0); }
  .menu button { justify-content: flex-start; border-radius: 10px; }
}
@media (max-width: 560px) {
  .form-grid { grid-template-columns: 1fr; }
  .req-body dl { grid-template-columns: 1fr; }
  .req-head { flex-wrap: wrap; }
}
`;
