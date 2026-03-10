      (function () {
        const STORAGE_KEY = "etro.setlist.v1";
        const LEGACY_COOKIE_KEY = "etro_setlist_v1";
        const PRESET_TIME_SIGNATURES = ["4/4", "6/8", "3/4"];
        const BPM_MIN = 0;
        const BPM_MAX = 240;
        const ALLOWED_CUSTOM_DENOMINATORS = [2, 4, 8, 16];
        const SONG_TITLE_MAX_LENGTH = 18;
        const SHARE_HASH_KEY = "sl";
        const SHARE_SCHEMA_VERSION = 2;

        function makeId() {
          if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
          }
          return `song-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }

        function createDefaultSong() {
          const defaultSignature = "4/4";
          return {
            id: makeId(),
            name: "",
            bpm: 120,
            timeSignature: defaultSignature,
            useAccents: false,
            doubleTime: false,
            accentBeats: getAccentBeatsForSignature(defaultSignature)
          };
        }

        const state = {
          songs: [],
          activeSongId: null,
          isPlaying: false,
          audioContext: null,
          schedulerTimer: null,
          nextNoteTime: 0,
          currentBeat: 0,
          activeBeatsPerBar: 4,
          visualTimers: [],
          wakeLock: null,
          bpmKnobAngle: 0,
          knobDragActive: false,
          knobLastAngle: 0,
          knobRemainder: 0,
          customSignaturePanelOpen: false,
          timeSignatureMenuOpen: false,
          titleEditSongId: null,
          pendingDeleteSongId: null,
          songTitleLimitHintTimer: null,
          shareModalStatusTimer: null,
          shareLink: ""
        };

        const lookaheadMs = 25;
        const scheduleAheadTime = 0.12;

        const els = {
          currentSongTitle: document.getElementById("currentSongTitle"),
          songTitleEditInput: document.getElementById("songTitleEditInput"),
          songTitleLimitInfo: document.getElementById("songTitleLimitInfo"),
          timeSignatureLabel: document.getElementById("timeSignatureLabel"),
          timeSignatureMenu: document.getElementById("timeSignatureMenu"),
          bpmDisplay: document.getElementById("bpmDisplay"),
          bpmMinus10Btn: document.getElementById("bpmMinus10Btn"),
          bpmMinus1Btn: document.getElementById("bpmMinus1Btn"),
          bpmPlus1Btn: document.getElementById("bpmPlus1Btn"),
          bpmPlus10Btn: document.getElementById("bpmPlus10Btn"),
          accentToggleBtn: document.getElementById("accentToggleBtn"),
          doubleTimeToggleBtn: document.getElementById("doubleTimeToggleBtn"),
          accentMapPanel: document.getElementById("accentMapPanel"),
          accentBeatButtons: document.getElementById("accentBeatButtons"),
          ts44Btn: document.getElementById("ts44Btn"),
          ts68Btn: document.getElementById("ts68Btn"),
          ts34Btn: document.getElementById("ts34Btn"),
          tsCustomBtn: document.getElementById("tsCustomBtn"),
          customSignaturePanel: document.getElementById("customSignaturePanel"),
          customSignatureNumeratorInput: document.getElementById("customSignatureNumeratorInput"),
          customSignatureDenominatorInput: document.getElementById("customSignatureDenominatorInput"),
          applyCustomSignatureBtn: document.getElementById("applyCustomSignatureBtn"),
          customSignatureError: document.getElementById("customSignatureError"),
          bpmRoller: document.getElementById("bpmRoller"),
          bpmRollerProgress: document.getElementById("bpmRollerProgress"),
          bpmRollerDial: document.getElementById("bpmRollerDial"),
          playBtn: document.getElementById("playBtn"),
          prevBtn: document.getElementById("prevBtn"),
          nextBtn: document.getElementById("nextBtn"),
          clearSetlistBtn: document.getElementById("clearSetlistBtn"),
          shareSetlistBtn: document.getElementById("shareSetlistBtn"),
          openImportSetlistBtn: document.getElementById("openImportSetlistBtn"),
          addSongBtn: document.getElementById("addSongBtn"),
          setlistContainer: document.getElementById("setlistContainer"),
          clearConfirmModal: document.getElementById("clearConfirmModal"),
          cancelClearModalBtn: document.getElementById("cancelClearModalBtn"),
          confirmClearModalBtn: document.getElementById("confirmClearModalBtn"),
          deleteConfirmModal: document.getElementById("deleteConfirmModal"),
          deleteConfirmMessage: document.getElementById("deleteConfirmMessage"),
          cancelDeleteModalBtn: document.getElementById("cancelDeleteModalBtn"),
          confirmDeleteModalBtn: document.getElementById("confirmDeleteModalBtn"),
          shareSetlistModal: document.getElementById("shareSetlistModal"),
          shareModalStatus: document.getElementById("shareModalStatus"),
          closeShareModalBtn: document.getElementById("closeShareModalBtn"),
          copyShareLinkBtn: document.getElementById("copyShareLinkBtn"),
          nativeShareLinkBtn: document.getElementById("nativeShareLinkBtn"),
          importSetlistModal: document.getElementById("importSetlistModal"),
          importSetlistInput: document.getElementById("importSetlistInput"),
          importSetlistError: document.getElementById("importSetlistError"),
          cancelImportModalBtn: document.getElementById("cancelImportModalBtn"),
          confirmImportModalBtn: document.getElementById("confirmImportModalBtn")
        };

        function registerServiceWorker() {
          if (!("serviceWorker" in navigator)) return;
          window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js").catch((error) => {
              console.warn("Service worker registration failed", error);
            });
          });
        }

        function parseTimeSignatureStrict(raw) {
          const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(raw || "");
          if (!match) {
            return { ok: false, message: "Use a format like 5/4." };
          }

          const numerator = Number.parseInt(match[1], 10);
          const denominator = Number.parseInt(match[2], 10);

          if (!Number.isFinite(numerator) || numerator < 1 || numerator > 32) {
            return { ok: false, message: "Numerator must be between 1 and 32." };
          }

          if (!Number.isFinite(denominator) || denominator < 1 || denominator > 32) {
            return { ok: false, message: "Denominator must be between 1 and 32." };
          }

          const isPowerOfTwo = (denominator & (denominator - 1)) === 0;
          if (!isPowerOfTwo) {
            return { ok: false, message: "Denominator must be a power of 2, like 2, 4, 8, 16." };
          }

          return {
            ok: true,
            beatsPerBar: numerator,
            denominator,
            label: `${numerator}/${denominator}`
          };
        }

        function parseTimeSignature(raw) {
          const strict = parseTimeSignatureStrict(raw);
          if (strict.ok) return strict;
          return { ok: true, beatsPerBar: 4, denominator: 4, label: "4/4" };
        }

        function isPresetTimeSignature(label) {
          return PRESET_TIME_SIGNATURES.includes(label);
        }

        function getCookie(name) {
          const encodedName = encodeURIComponent(name);
          const cookieParts = document.cookie ? document.cookie.split("; ") : [];
          for (const part of cookieParts) {
            if (!part.startsWith(`${encodedName}=`)) continue;
            return decodeURIComponent(part.slice(encodedName.length + 1));
          }
          return null;
        }

        function clearCookie(name) {
          document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
        }

        function getFromStorage() {
          try {
            if (!window.localStorage) return null;
            return localStorage.getItem(STORAGE_KEY);
          } catch (error) {
            console.warn("Could not access localStorage", error);
            return null;
          }
        }

        function saveToStorage(payload) {
          try {
            if (window.localStorage) {
              localStorage.setItem(STORAGE_KEY, payload);
            }
          } catch (error) {
            console.warn("Could not write localStorage", error);
          }
        }

        function clampSongTitleInput(rawValue) {
          return String(rawValue || "").slice(0, SONG_TITLE_MAX_LENGTH);
        }

        function sanitizeSongName(rawValue) {
          return clampSongTitleInput(rawValue).trim();
        }

        function hideSongTitleLimitInfo() {
          if (state.songTitleLimitHintTimer !== null) {
            window.clearTimeout(state.songTitleLimitHintTimer);
            state.songTitleLimitHintTimer = null;
          }
          els.songTitleLimitInfo.classList.add("hidden");
        }

        function showSongTitleLimitInfo() {
          if (!state.titleEditSongId) return;
          if (state.songTitleLimitHintTimer !== null) {
            window.clearTimeout(state.songTitleLimitHintTimer);
            state.songTitleLimitHintTimer = null;
          }
          els.songTitleLimitInfo.classList.remove("hidden");
          state.songTitleLimitHintTimer = window.setTimeout(() => {
            els.songTitleLimitInfo.classList.add("hidden");
            state.songTitleLimitHintTimer = null;
          }, 1400);
        }

        function normalizeAccentBeats(rawAccentBeats, beatsPerBar, fallbackBeats) {
          const maxBeats = Math.max(1, Number.parseInt(beatsPerBar, 10) || 1);
          const fallback = Array.isArray(fallbackBeats) && fallbackBeats.length ? fallbackBeats : [1];
          const source = Array.isArray(rawAccentBeats) ? rawAccentBeats : fallback;
          const deduped = new Set();

          source.forEach((value) => {
            const beat = Number.parseInt(value, 10);
            if (!Number.isFinite(beat)) return;
            if (beat < 1 || beat > maxBeats) return;
            deduped.add(beat);
          });

          return Array.from(deduped).sort((a, b) => a - b);
        }

        function toBoolean(value) {
          if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (["true", "1", "yes", "on"].includes(normalized)) return true;
            if (["false", "0", "no", "off", ""].includes(normalized)) return false;
          }
          return Boolean(value);
        }

        function normalizeSong(song) {
          const parsed = parseTimeSignature(song.timeSignature);
          const defaultAccentBeats = getAccentBeatsForSignature(parsed.label);
          return {
            id: song.id || makeId(),
            name: sanitizeSongName(song.name),
            bpm: clampBpm(song.bpm),
            timeSignature: parsed.label,
            useAccents: toBoolean(song.useAccents),
            doubleTime: toBoolean(song.doubleTime),
            accentBeats: normalizeAccentBeats(song.accentBeats, parsed.beatsPerBar, defaultAccentBeats)
          };
        }

        function clampBpm(value) {
          const bpm = Number.parseInt(value, 10);
          if (!Number.isFinite(bpm)) return 120;
          return Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
        }

        function resetToDefaultSetlist() {
          const song = createDefaultSong();
          state.songs = [song];
          state.activeSongId = song.id;
          state.titleEditSongId = null;
          state.pendingDeleteSongId = null;
          state.timeSignatureMenuOpen = false;
          state.customSignaturePanelOpen = false;
        }

        function loadSongs() {
          try {
            let raw = getFromStorage();
            if (!raw) {
              const legacyCookie = getCookie(LEGACY_COOKIE_KEY);
              if (legacyCookie) {
                raw = legacyCookie;
                saveToStorage(legacyCookie);
                clearCookie(LEGACY_COOKIE_KEY);
              }
            }

            if (!raw) {
              resetToDefaultSetlist();
              saveSongs();
              return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed.songs)) {
              throw new Error("Invalid storage shape");
            }

            state.songs = parsed.songs.map(normalizeSong);
            state.activeSongId = parsed.activeSongId;

            if (!state.songs.length) {
              resetToDefaultSetlist();
              saveSongs();
              return;
            }

            if (!state.songs.some((song) => song.id === state.activeSongId)) {
              state.activeSongId = state.songs[0].id;
            }

            saveSongs();
          } catch (error) {
            console.warn("Failed to read setlist from localStorage", error);
            resetToDefaultSetlist();
            saveSongs();
          }
        }

        function saveSongs() {
          const payload = JSON.stringify({ songs: state.songs, activeSongId: state.activeSongId });
          saveToStorage(payload);
        }

        function clearShareModalStatusTimer() {
          if (state.shareModalStatusTimer !== null) {
            window.clearTimeout(state.shareModalStatusTimer);
            state.shareModalStatusTimer = null;
          }
        }

        function setShareModalStatus(message, tone = "success") {
          clearShareModalStatusTimer();
          const hasMessage = Boolean(message);
          els.shareModalStatus.textContent = message || "";
          els.shareModalStatus.classList.toggle("hidden", !hasMessage);
          els.shareModalStatus.classList.toggle("text-lime-300", hasMessage && tone !== "error");
          els.shareModalStatus.classList.toggle("text-red-400", hasMessage && tone === "error");
          if (!hasMessage) return;

          state.shareModalStatusTimer = window.setTimeout(() => {
            els.shareModalStatus.textContent = "";
            els.shareModalStatus.classList.add("hidden");
            els.shareModalStatus.classList.remove("text-red-400");
            els.shareModalStatus.classList.add("text-lime-300");
            state.shareModalStatusTimer = null;
          }, 1800);
        }

        function setImportSetlistError(message) {
          els.importSetlistError.textContent = message;
          els.importSetlistError.classList.remove("hidden");
        }

        function clearImportSetlistError() {
          els.importSetlistError.textContent = "";
          els.importSetlistError.classList.add("hidden");
        }

        function showModal(modal) {
          if (!modal) return;
          modal.classList.remove("hidden");
          modal.classList.add("flex");
          modal.setAttribute("aria-hidden", "false");
        }

        function hideModal(modal) {
          if (!modal) return;
          modal.classList.remove("flex");
          modal.classList.add("hidden");
          modal.setAttribute("aria-hidden", "true");
        }

        function encodeBase64UrlUtf8(text) {
          const bytes = new TextEncoder().encode(String(text || ""));
          let binary = "";
          for (let index = 0; index < bytes.length; index += 1) {
            binary += String.fromCharCode(bytes[index]);
          }
          return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
        }

        function decodeBase64UrlUtf8(token) {
          const normalized = String(token || "").replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
          const binary = atob(padded);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return new TextDecoder().decode(bytes);
        }

        function toCompactShareSong(song) {
          const normalizedSong = normalizeSong(song || {});
          const compactSong = {
            b: normalizedSong.bpm,
            t: normalizedSong.timeSignature
          };

          if (normalizedSong.name) {
            compactSong.n = normalizedSong.name;
          }

          if (toBoolean(normalizedSong.useAccents)) {
            compactSong.a = 1;
          }

          if (toBoolean(normalizedSong.doubleTime)) {
            compactSong.d = 1;
          }

          const parsedSignature = parseTimeSignature(normalizedSong.timeSignature);
          const defaultAccentBeats = getAccentBeatsForSignature(parsedSignature.label);
          const accentBeats = normalizeAccentBeats(
            normalizedSong.accentBeats,
            parsedSignature.beatsPerBar,
            defaultAccentBeats
          );
          const normalizedDefaultAccentBeats = normalizeAccentBeats(
            defaultAccentBeats,
            parsedSignature.beatsPerBar,
            defaultAccentBeats
          );
          const isDefaultAccentPattern =
            accentBeats.length === normalizedDefaultAccentBeats.length &&
            accentBeats.every((beat, index) => beat === normalizedDefaultAccentBeats[index]);

          if (!isDefaultAccentPattern) {
            compactSong.x = accentBeats;
          }

          return compactSong;
        }

        function buildSharePayload() {
          const songs = state.songs.length ? state.songs.map((song) => normalizeSong(song)) : [createDefaultSong()];
          const activeSongIndex = songs.findIndex((song) => song.id === state.activeSongId);
          const compactSongs = songs.map((song) => toCompactShareSong(song));

          return {
            v: SHARE_SCHEMA_VERSION,
            ai: activeSongIndex >= 0 ? activeSongIndex : 0,
            s: compactSongs
          };
        }

        function encodeSharePayload(payload) {
          const payloadText = JSON.stringify(payload);
          return encodeBase64UrlUtf8(payloadText);
        }

        function normalizeImportedSong(rawSong) {
          if (!rawSong || typeof rawSong !== "object") {
            return normalizeSong({});
          }

          const nextSong = {
            id: typeof rawSong.id === "string" && rawSong.id.trim() ? rawSong.id.trim() : makeId(),
            name: rawSong.name ?? rawSong.n ?? "",
            bpm: rawSong.bpm ?? rawSong.b,
            timeSignature: rawSong.timeSignature ?? rawSong.t,
            useAccents: rawSong.useAccents ?? rawSong.a,
            doubleTime: rawSong.doubleTime ?? rawSong.d,
            accentBeats: rawSong.accentBeats ?? rawSong.x
          };

          return normalizeSong(nextSong);
        }

        function normalizeImportedSetlistPayload(payload) {
          if (!payload || typeof payload !== "object") {
            return { ok: false, message: "Import data is invalid." };
          }

          const rawSongs = Array.isArray(payload.s) ? payload.s : Array.isArray(payload.songs) ? payload.songs : null;
          if (!rawSongs || rawSongs.length === 0) {
            return { ok: false, message: "Import data has no songs." };
          }

          const seenIds = new Set();
          const songs = rawSongs
            .map((rawSong) => normalizeImportedSong(rawSong))
            .map((song) => {
              if (!seenIds.has(song.id)) {
                seenIds.add(song.id);
                return song;
              }
              const dedupedId = makeId();
              seenIds.add(dedupedId);
              return { ...song, id: dedupedId };
            });

          if (!songs.length) {
            return { ok: false, message: "Import data has no songs." };
          }

          const rawActiveSongId =
            typeof payload.a === "string"
              ? payload.a
              : typeof payload.activeSongId === "string"
                ? payload.activeSongId
                : "";
          const rawActiveSongIndex = Number.parseInt(payload.ai, 10);
          const activeSongId =
            Number.isFinite(rawActiveSongIndex) &&
            rawActiveSongIndex >= 0 &&
            rawActiveSongIndex < songs.length
              ? songs[rawActiveSongIndex].id
              : songs.some((song) => song.id === rawActiveSongId)
                ? rawActiveSongId
                : songs[0].id;

          return {
            ok: true,
            songs,
            activeSongId
          };
        }

        function decodeSharePayloadFromToken(token) {
          try {
            const tokenText = decodeURIComponent(String(token || "").trim());
            if (!tokenText) {
              return { ok: false, message: "Export code is empty." };
            }
            const payloadText = decodeBase64UrlUtf8(tokenText);
            const payload = JSON.parse(payloadText);
            return normalizeImportedSetlistPayload(payload);
          } catch (error) {
            console.warn("Could not decode Share token", error);
            return { ok: false, message: "Could not decode this Export code." };
          }
        }

        function getShareTokenFromLocation() {
          const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
          if (hash) {
            const hashParams = new URLSearchParams(hash);
            const hashToken = hashParams.get(SHARE_HASH_KEY);
            if (hashToken) return hashToken.trim();
          }

          const searchParams = new URLSearchParams(window.location.search);
          const queryToken = searchParams.get(SHARE_HASH_KEY);
          if (queryToken) return queryToken.trim();

          return "";
        }

        function extractShareTokenFromInput(rawInput) {
          const trimmed = String(rawInput || "").trim();
          if (!trimmed) return "";

          if (trimmed.startsWith(`${SHARE_HASH_KEY}=`)) {
            return decodeURIComponent(trimmed.slice(SHARE_HASH_KEY.length + 1));
          }

          const directTokenMatch = /(?:^|[#?&])sl=([^&\s]+)/i.exec(trimmed);
          if (directTokenMatch) {
            return decodeURIComponent(directTokenMatch[1]);
          }

          try {
            const parsedUrl = new URL(trimmed, window.location.origin);
            const queryToken = parsedUrl.searchParams.get(SHARE_HASH_KEY);
            if (queryToken) {
              return queryToken.trim();
            }
            const hash = parsedUrl.hash.startsWith("#") ? parsedUrl.hash.slice(1) : parsedUrl.hash;
            if (hash) {
              const hashParams = new URLSearchParams(hash);
              const hashToken = hashParams.get(SHARE_HASH_KEY);
              if (hashToken) {
                return hashToken.trim();
              }
            }
          } catch (error) {
            // Non-URL input. Fall through and treat as direct code.
          }

          return trimmed;
        }

        function parseImportPayloadFromText(rawValue) {
          const trimmed = String(rawValue || "").trim();
          if (!trimmed) {
            return { ok: false, message: "Paste an Export link or import code." };
          }

          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
              const jsonPayload = JSON.parse(trimmed);
              if (Array.isArray(jsonPayload)) {
                return normalizeImportedSetlistPayload({ songs: jsonPayload });
              }
              return normalizeImportedSetlistPayload(jsonPayload);
            } catch (error) {
              return { ok: false, message: "JSON import is invalid." };
            }
          }

          const shareToken = extractShareTokenFromInput(trimmed);
          if (!shareToken) {
            return { ok: false, message: "Could not parse the Export link." };
          }
          return decodeSharePayloadFromToken(shareToken);
        }

        function applyImportedSetlist(parsedImport) {
          const wasPlaying = state.isPlaying;
          if (wasPlaying) {
            stopMetronome();
          }

          state.songs = parsedImport.songs;
          state.activeSongId = parsedImport.activeSongId;
          state.titleEditSongId = null;
          state.pendingDeleteSongId = null;
          state.timeSignatureMenuOpen = false;
          const active = getActiveSong();
          state.customSignaturePanelOpen = active
            ? !isPresetTimeSignature(parseTimeSignature(active.timeSignature).label)
            : false;

          saveSongs();
          renderAll();

          if (wasPlaying) {
            startMetronome().catch((error) => console.error("Restart failed", error));
          }
        }

        function buildShareLink() {
          const payload = buildSharePayload();
          const token = encodeSharePayload(payload);
          const baseUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
          return `${baseUrl}#${SHARE_HASH_KEY}=${token}`;
        }

        function openShareSetlistModal() {
          state.shareLink = buildShareLink();
          setShareModalStatus("");

          const canNativeShare = typeof navigator.share === "function";
          els.nativeShareLinkBtn.disabled = !canNativeShare;
          els.nativeShareLinkBtn.classList.toggle("hidden", !canNativeShare);

          showModal(els.shareSetlistModal);
        }

        function closeShareSetlistModal() {
          hideModal(els.shareSetlistModal);
          state.shareLink = "";
          clearShareModalStatusTimer();
          setShareModalStatus("");
        }

        function copyShareLink() {
          const shareLink = (state.shareLink || buildShareLink()).trim();
          if (!shareLink) {
            setShareModalStatus("No export link available to copy.", "error");
            return;
          }

          const fallbackCopy = () => {
            try {
              const tempField = document.createElement("textarea");
              tempField.value = shareLink;
              tempField.setAttribute("readonly", "");
              tempField.style.position = "fixed";
              tempField.style.top = "-9999px";
              tempField.style.opacity = "0";
              document.body.append(tempField);
              tempField.focus();
              tempField.select();
              const copied = document.execCommand("copy");
              tempField.remove();
              return copied;
            } catch (error) {
              return false;
            }
          };

          const onCopied = () => setShareModalStatus("Link copied.");
          const onFailed = () => setShareModalStatus("Copy failed. Copy it manually.", "error");

          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard
              .writeText(shareLink)
              .then(onCopied)
              .catch(() => {
                if (fallbackCopy()) {
                  onCopied();
                } else {
                  onFailed();
                }
              });
            return;
          }

          if (fallbackCopy()) {
            onCopied();
          } else {
            onFailed();
          }
        }

        async function nativeShareLink() {
          const shareLink = (state.shareLink || buildShareLink()).trim();
          if (!shareLink) {
            setShareModalStatus("No export link available to send.", "error");
            return;
          }

          if (typeof navigator.share !== "function") {
            setShareModalStatus("Send is not supported on this device.", "error");
            return;
          }

          try {
            await navigator.share({
              title: "etro setlist",
              text: "etro setlist",
              url: shareLink
            });
            setShareModalStatus("Sent.");
          } catch (error) {
            if (error && error.name === "AbortError") return;
            setShareModalStatus("Send failed.", "error");
          }
        }

        function openImportSetlistModal(prefillValue = "") {
          clearImportSetlistError();
          els.importSetlistInput.value = String(prefillValue || "");
          showModal(els.importSetlistModal);
          requestAnimationFrame(() => {
            els.importSetlistInput.focus();
            els.importSetlistInput.select();
          });
        }

        function closeImportSetlistModal() {
          hideModal(els.importSetlistModal);
          clearImportSetlistError();
        }

        function confirmImportSetlist() {
          const parsedImport = parseImportPayloadFromText(els.importSetlistInput.value);
          if (!parsedImport.ok) {
            setImportSetlistError(parsedImport.message);
            return;
          }

          applyImportedSetlist(parsedImport);
          closeImportSetlistModal();
        }

        function maybeOpenImportFromUrlToken() {
          const shareToken = getShareTokenFromLocation();
          if (!shareToken) return;
          const shareLink = `${window.location.origin}${window.location.pathname}${window.location.search}#${SHARE_HASH_KEY}=${shareToken}`;
          openImportSetlistModal(shareLink);
          const cleanUrl = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState(null, "", cleanUrl);
        }

        function getActiveSong() {
          return state.songs.find((song) => song.id === state.activeSongId) || null;
        }

        function getSongTitleForMainView(song) {
          const trimmed = sanitizeSongName(song?.name || "");
          return {
            title: trimmed || "Untitled",
            isPlaceholder: trimmed.length === 0
          };
        }

        function isMobileDevice() {
          const ua = navigator.userAgent || "";
          const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
          const narrowViewport = window.matchMedia("(max-width: 900px)").matches;
          return coarsePointer || narrowViewport || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        }

        function applyDeviceModeClass() {
          document.body.classList.toggle("mobile-mode", isMobileDevice());
        }

        function setCustomSignatureError(message) {
          els.customSignatureError.textContent = message;
          els.customSignatureError.classList.remove("hidden");
        }

        function clearCustomSignatureError() {
          els.customSignatureError.textContent = "";
          els.customSignatureError.classList.add("hidden");
        }

        function setWakeLockStatus(_message) {
          // Wake lock UI indicator intentionally removed.
        }

        function setCustomSignatureInputsFromLabel(signatureLabel) {
          const parsed = parseTimeSignature(signatureLabel);
          setCustomNumeratorValue(parsed.beatsPerBar);
          setCustomDenominatorValue(parsed.denominator);
        }

        function getCustomSignatureCandidateFromInputs() {
          const numeratorRaw = els.customSignatureNumeratorInput.value.trim();
          const denominatorRaw = els.customSignatureDenominatorInput.value.trim();
          if (!numeratorRaw || !denominatorRaw) {
            return { ok: false, message: "Enter both Top and Bottom values." };
          }

          const strict = parseTimeSignatureStrict(`${numeratorRaw}/${denominatorRaw}`);
          if (!strict.ok) {
            return { ok: false, message: strict.message };
          }

          if (!ALLOWED_CUSTOM_DENOMINATORS.includes(strict.denominator)) {
            return { ok: false, message: "Bottom must be 2, 4, 8, or 16." };
          }

          return { ok: true, strict };
        }

        function setCustomNumeratorValue(value) {
          const parsed = Number.parseInt(value, 10);
          const safe = Number.isFinite(parsed) ? Math.min(32, Math.max(1, parsed)) : 4;
          els.customSignatureNumeratorInput.value = String(safe);
        }

        function getNearestAllowedCustomDenominator(value) {
          const parsed = Number.parseInt(value, 10);
          const minAllowed = ALLOWED_CUSTOM_DENOMINATORS[0];
          const maxAllowed = ALLOWED_CUSTOM_DENOMINATORS[ALLOWED_CUSTOM_DENOMINATORS.length - 1];
          const safe = Number.isFinite(parsed) ? Math.min(maxAllowed, Math.max(minAllowed, parsed)) : 4;
          return ALLOWED_CUSTOM_DENOMINATORS.reduce((closest, candidate) => {
            return Math.abs(candidate - safe) < Math.abs(closest - safe) ? candidate : closest;
          }, ALLOWED_CUSTOM_DENOMINATORS[0]);
        }

        function setCustomDenominatorValue(value) {
          const safe = getNearestAllowedCustomDenominator(value);
          els.customSignatureDenominatorInput.value = String(safe);
        }

        function stepCustomNumerator(delta) {
          const current = Number.parseInt(els.customSignatureNumeratorInput.value, 10);
          const next = (Number.isFinite(current) ? current : 4) + delta;
          setCustomNumeratorValue(next);
          clearCustomSignatureError();
        }

        function stepCustomDenominator(direction) {
          const current = Number.parseInt(els.customSignatureDenominatorInput.value, 10);
          const nearest = getNearestAllowedCustomDenominator(Number.isFinite(current) ? current : 4);
          const currentIndex = ALLOWED_CUSTOM_DENOMINATORS.indexOf(nearest);
          const nextIndex = Math.min(
            ALLOWED_CUSTOM_DENOMINATORS.length - 1,
            Math.max(0, currentIndex + direction)
          );
          setCustomDenominatorValue(ALLOWED_CUSTOM_DENOMINATORS[nextIndex]);
          clearCustomSignatureError();
        }

        function renderRollerRangeByBpm(bpm) {
          const safeBpm = clampBpm(bpm);
          const range = Math.max(1, BPM_MAX - BPM_MIN);
          const ratio = (safeBpm - BPM_MIN) / range;
          const degrees = ratio * 360;
          const dialStartOffset = -90;
          const ringColor = "rgba(163, 230, 53, 1)";
          const emptyColor = "rgba(38, 38, 38, 1)";

          els.bpmRollerProgress.style.background = `conic-gradient(from -90deg, ${ringColor} ${degrees}deg, ${emptyColor} ${degrees}deg)`;
          state.bpmKnobAngle = degrees + dialStartOffset;
          els.bpmRollerDial.style.transform = `rotate(${state.bpmKnobAngle}deg)`;
        }

        function updateDocumentTitle() {
          const active = getActiveSong();
          if (!active) {
            document.title = "etro 120 4/4";
            return;
          }
          const parsed = parseTimeSignature(active.timeSignature);
          document.title = `etro ${active.bpm} ${parsed.label}`;
        }

        function updateSignatureButtonState(button, isActive) {
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        }

        function getAccentBeatsForSignature(signatureLabel) {
          if (signatureLabel === "6/8") return [1, 4];
          if (signatureLabel === "3/4") return [1];
          if (signatureLabel === "4/4") return [1];
          return [1];
        }

        function isAccentStepInBar(stepInBar, song, parsedSignature) {
          if (!song || !toBoolean(song.useAccents)) return false;
          const beatNumber = stepInBar + 1;
          const defaultAccentBeats = getAccentBeatsForSignature(parsedSignature.label);
          const accentBeats = normalizeAccentBeats(song.accentBeats, parsedSignature.beatsPerBar, defaultAccentBeats);
          return accentBeats.includes(beatNumber);
        }

        function renderRhythmToggles(song, parsedSignature) {
          const hasSong = Boolean(song);
          const useAccents = hasSong && toBoolean(song.useAccents);
          const doubleTime = hasSong && toBoolean(song.doubleTime);
          const mobileRhythmPills = document.body.classList.contains("mobile-mode");

          els.accentToggleBtn.textContent = mobileRhythmPills ? "A" : "Accent";
          els.doubleTimeToggleBtn.textContent = mobileRhythmPills ? "D" : "Double Time";
          els.accentToggleBtn.setAttribute("aria-label", "Accent");
          els.doubleTimeToggleBtn.setAttribute("aria-label", "Double Time");
          els.accentToggleBtn.title = "Accent";
          els.doubleTimeToggleBtn.title = "Double Time";
          els.accentToggleBtn.classList.toggle("is-active", useAccents);
          els.doubleTimeToggleBtn.classList.toggle("is-active", doubleTime);
          els.accentToggleBtn.setAttribute("aria-pressed", useAccents ? "true" : "false");
          els.doubleTimeToggleBtn.setAttribute("aria-pressed", doubleTime ? "true" : "false");

          if (!hasSong || !parsedSignature) {
            els.accentMapPanel.classList.add("hidden");
            els.accentMapPanel.classList.remove("accent-map-disabled");
            els.accentBeatButtons.innerHTML = "";
            return;
          }

          const defaultAccentBeats = getAccentBeatsForSignature(parsedSignature.label);
          const accentBeats = normalizeAccentBeats(song.accentBeats, parsedSignature.beatsPerBar, defaultAccentBeats);
          const accentSet = new Set(accentBeats);
          const beatButtons = Array.from({ length: parsedSignature.beatsPerBar }, (_, index) => {
            const beatNumber = index + 1;
            const selectedClass = accentSet.has(beatNumber) ? " is-selected" : "";
            return `<button type="button" data-accent-beat="${beatNumber}" class="accent-beat-btn line-ui${selectedClass} min-h-[2.65rem] min-w-[2.65rem] rounded-lg px-1 text-base font-black">${beatNumber}</button>`;
          }).join("");

          els.accentBeatButtons.innerHTML = beatButtons;
          els.accentMapPanel.classList.toggle("accent-map-disabled", !useAccents);
          els.accentMapPanel.classList.remove("hidden");
        }

        function openTitleEditor() {
          const active = getActiveSong();
          if (!active) return;

          state.titleEditSongId = active.id;
          hideSongTitleLimitInfo();
          els.songTitleEditInput.maxLength = SONG_TITLE_MAX_LENGTH;
          els.songTitleEditInput.value = clampSongTitleInput(active.name);
          els.currentSongTitle.classList.add("hidden");
          els.songTitleEditInput.classList.remove("hidden");

          requestAnimationFrame(() => {
            els.songTitleEditInput.focus();
            els.songTitleEditInput.select();
          });
        }

        function closeTitleEditor(commitChanges) {
          const active = getActiveSong();
          const isEditing = active && state.titleEditSongId === active.id;

          if (isEditing && commitChanges) {
            const nextName = sanitizeSongName(els.songTitleEditInput.value);
            if (nextName !== active.name) {
              state.songs = state.songs.map((song) => {
                if (song.id !== active.id) return song;
                return { ...song, name: nextName };
              });
              saveSongs();
            }
          }

          state.titleEditSongId = null;
          hideSongTitleLimitInfo();
          els.songTitleEditInput.classList.add("hidden");
          els.currentSongTitle.classList.remove("hidden");
          renderAll();
        }

        function closeTimeSignatureMenu() {
          state.timeSignatureMenuOpen = false;
          state.customSignaturePanelOpen = false;
          clearCustomSignatureError();
          renderLivePanel();
        }

        function toggleTimeSignatureMenu() {
          const active = getActiveSong();
          if (!active) return;

          if (state.timeSignatureMenuOpen) {
            closeTimeSignatureMenu();
            return;
          }

          const activeSignature = parseTimeSignature(active.timeSignature).label;
          state.timeSignatureMenuOpen = true;
          state.customSignaturePanelOpen = !isPresetTimeSignature(activeSignature);
          if (state.customSignaturePanelOpen) {
            setCustomSignatureInputsFromLabel(activeSignature);
          }
          clearCustomSignatureError();
          renderLivePanel();
        }

        function renderSignatureControls(activeSignatureLabel) {
          const hasActive = Boolean(activeSignatureLabel);
          if (!hasActive) {
            state.customSignaturePanelOpen = false;
            state.timeSignatureMenuOpen = false;
          }

          els.timeSignatureLabel.textContent = hasActive ? `${activeSignatureLabel}` : "--";
          els.timeSignatureLabel.disabled = !hasActive;
          els.timeSignatureLabel.classList.toggle("opacity-50", !hasActive);
          els.timeSignatureLabel.classList.toggle("cursor-not-allowed", !hasActive);

          const menuVisible = hasActive && state.timeSignatureMenuOpen;
          els.timeSignatureLabel.setAttribute("aria-expanded", menuVisible ? "true" : "false");
          els.timeSignatureMenu.classList.toggle("hidden", !menuVisible);

          const isPreset = hasActive && isPresetTimeSignature(activeSignatureLabel);
          const customButtonActive = hasActive && (!isPreset || state.customSignaturePanelOpen);
          const panelVisible = menuVisible && (state.customSignaturePanelOpen || !isPreset);

          updateSignatureButtonState(els.ts44Btn, activeSignatureLabel === "4/4");
          updateSignatureButtonState(els.ts68Btn, activeSignatureLabel === "6/8");
          updateSignatureButtonState(els.ts34Btn, activeSignatureLabel === "3/4");
          updateSignatureButtonState(els.tsCustomBtn, customButtonActive);

          if (panelVisible) {
            els.customSignaturePanel.classList.remove("hidden");
            const editingCustomInputs =
              document.activeElement === els.customSignatureNumeratorInput ||
              document.activeElement === els.customSignatureDenominatorInput;
            if (!editingCustomInputs) {
              if (!isPreset) {
                setCustomSignatureInputsFromLabel(activeSignatureLabel);
              } else if (
                !els.customSignatureNumeratorInput.value.trim() ||
                !els.customSignatureDenominatorInput.value.trim()
              ) {
                setCustomSignatureInputsFromLabel(activeSignatureLabel);
              }
            }
          } else {
            els.customSignaturePanel.classList.add("hidden");
            clearCustomSignatureError();
          }

        }

        function renderLivePanel() {
          const active = getActiveSong();
          if (!active) {
            state.titleEditSongId = null;
            els.currentSongTitle.textContent = "No Song Selected";
            els.currentSongTitle.classList.remove("text-neutral-500");
            els.currentSongTitle.classList.add("text-neutral-100");
            els.currentSongTitle.classList.remove("hidden");
            els.songTitleEditInput.classList.add("hidden");
            els.bpmDisplay.textContent = "--";
            els.bpmRoller.setAttribute("aria-valuenow", "0");
            renderRollerRangeByBpm(0);
            renderSignatureControls(null);
            renderRhythmToggles(null, null);
            disableTransport(true);
            return;
          }

          const parsed = parseTimeSignature(active.timeSignature);
          state.activeBeatsPerBar = parsed.beatsPerBar;

          if (state.titleEditSongId !== active.id) {
            state.titleEditSongId = null;
            hideSongTitleLimitInfo();
            els.currentSongTitle.classList.remove("hidden");
            els.songTitleEditInput.classList.add("hidden");
          }

          if (state.titleEditSongId === active.id) {
            els.songTitleEditInput.classList.remove("hidden");
            els.currentSongTitle.classList.add("hidden");
          } else {
            const titleState = getSongTitleForMainView(active);
            els.currentSongTitle.textContent = titleState.title;
            els.currentSongTitle.classList.toggle("text-neutral-500", titleState.isPlaceholder);
            els.currentSongTitle.classList.toggle("text-neutral-100", !titleState.isPlaceholder);
            els.currentSongTitle.classList.remove("hidden");
            els.songTitleEditInput.classList.add("hidden");
            hideSongTitleLimitInfo();
          }

          els.bpmDisplay.textContent = String(active.bpm);
          els.bpmRoller.setAttribute("aria-valuenow", String(active.bpm));
          renderRollerRangeByBpm(active.bpm);
          renderSignatureControls(parsed.label);
          renderRhythmToggles(active, parsed);
          disableTransport(false);
        }

        function disableTransport(disabled) {
          const transportButtons = [
            els.playBtn,
            els.prevBtn,
            els.nextBtn,
            els.bpmMinus10Btn,
            els.bpmMinus1Btn,
            els.bpmPlus1Btn,
            els.bpmPlus10Btn,
            els.accentToggleBtn,
            els.doubleTimeToggleBtn,
            els.ts44Btn,
            els.ts68Btn,
            els.ts34Btn,
            els.tsCustomBtn,
            els.applyCustomSignatureBtn,
            els.currentSongTitle,
            els.timeSignatureLabel
          ];

          transportButtons.forEach((button) => {
            button.disabled = disabled;
            button.classList.toggle("opacity-50", disabled);
            button.classList.toggle("cursor-not-allowed", disabled);
          });

          [els.customSignatureNumeratorInput, els.customSignatureDenominatorInput].forEach((input) => {
            input.disabled = disabled;
            input.classList.toggle("opacity-50", disabled);
            input.classList.toggle("cursor-not-allowed", disabled);
          });

          const customPanelButtons = els.customSignaturePanel.querySelectorAll(
            "[data-custom-numerator-step], [data-custom-denominator-step]"
          );
          customPanelButtons.forEach((button) => {
            button.disabled = disabled;
            button.classList.toggle("opacity-50", disabled);
            button.classList.toggle("cursor-not-allowed", disabled);
          });

          els.bpmRoller.classList.toggle("opacity-50", disabled);
          els.bpmRoller.classList.toggle("cursor-not-allowed", disabled);
          if (disabled) {
            els.bpmRoller.setAttribute("aria-disabled", "true");
            els.bpmRoller.setAttribute("tabindex", "-1");
          } else {
            els.bpmRoller.setAttribute("aria-disabled", "false");
            els.bpmRoller.setAttribute("tabindex", "0");
          }

          const noSongs = state.songs.length === 0;
          els.clearSetlistBtn.disabled = noSongs;
          els.clearSetlistBtn.classList.toggle("opacity-50", noSongs);
          els.clearSetlistBtn.classList.toggle("cursor-not-allowed", noSongs);
        }

        function renderSetlist() {
          const activeId = state.activeSongId;

          if (!state.songs.length) {
            els.setlistContainer.innerHTML =
              '<p class="line-ui rounded-xl px-3 py-3 text-sm text-neutral-300">No songs yet. Tap + to start.</p>';
            return;
          }

          const listMarkup = state.songs
            .map((song) => {
              const isActive = song.id === activeId;
              const rawTitle = String(song.name || "").trim();
              const title = rawTitle.length > SONG_TITLE_MAX_LENGTH ? `${rawTitle.slice(0, SONG_TITLE_MAX_LENGTH)}...` : rawTitle;
              const hasTitle = title.length > 0;
              const titleMarkup = hasTitle
                ? `<span class="song-title block text-base font-black leading-tight ${isActive ? "text-lime-200" : "text-neutral-100"}">${escapeHtml(title)}</span>`
                : "";
              const signatureClass = hasTitle
                ? `whitespace-nowrap text-[0.66rem] font-semibold uppercase tracking-[0.18em] ${isActive ? "text-lime-300/80" : "text-neutral-400"}`
                : `whitespace-nowrap text-sm font-semibold tracking-[0.12em] ${isActive ? "text-lime-300/80" : "text-neutral-300"}`;
              const signatureRowClass = hasTitle
                ? "mt-1 flex items-center gap-1.5 flex-nowrap"
                : "flex items-center gap-1.5 flex-nowrap";
              const accentPill = song.useAccents ? '<span class="song-pill song-pill-accent" title="Accented beats">A</span>' : "";
              const doublePill = song.doubleTime ? '<span class="song-pill song-pill-double" title="Double time">D</span>' : "";
              const optionPills = accentPill || doublePill ? `<span class="flex shrink-0 items-center gap-1 flex-nowrap">${accentPill}${doublePill}</span>` : "";

              return `
                <article class="setlist-row" data-song-id="${song.id}">
                  <button type="button" class="song-select line-ui ${isActive ? "is-active" : ""} flex min-h-[3.6rem] flex-1 items-center justify-between rounded-lg px-2.5 text-left">
                    <span class="pr-2 min-w-0 flex-1">
                      ${titleMarkup}
                      <span class="${signatureRowClass}">
                        <span class="${signatureClass}">${song.timeSignature}</span>
                        ${optionPills}
                      </span>
                    </span>
                    <span class="text-xl font-black ${isActive ? "text-lime-300" : "text-neutral-200"}">${song.bpm}</span>
                  </button>
                  <button type="button" class="song-delete line-ui danger-line-ui flex min-h-[3.6rem] min-w-[3.1rem] items-center justify-center rounded-lg px-2 text-red-300" aria-label="Delete song">
                    <svg class="pointer-events-none h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M4 7h16" stroke-linecap="round" />
                      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke-linecap="round" />
                      <path d="M8 7l1 12a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9L16 7" stroke-linecap="round" stroke-linejoin="round" />
                      <path d="M10 11v5M14 11v5" stroke-linecap="round" />
                    </svg>
                  </button>
                </article>
              `;
            })
            .join("");

          els.setlistContainer.innerHTML = listMarkup;
        }

        function escapeHtml(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }

        function addDefaultSong() {
          const newSong = createDefaultSong();

          state.songs.push(newSong);
          state.activeSongId = newSong.id;
          state.titleEditSongId = null;
          state.timeSignatureMenuOpen = false;
          state.customSignaturePanelOpen = !isPresetTimeSignature(newSong.timeSignature);
          saveSongs();
          renderAll();

          if (state.isPlaying) {
            restartMetronome().catch((error) => console.error("Restart failed", error));
          }
        }

        function openClearConfirmModal() {
          els.clearConfirmModal.classList.remove("hidden");
          els.clearConfirmModal.classList.add("flex");
          els.clearConfirmModal.setAttribute("aria-hidden", "false");
        }

        function closeClearConfirmModal() {
          els.clearConfirmModal.classList.remove("flex");
          els.clearConfirmModal.classList.add("hidden");
          els.clearConfirmModal.setAttribute("aria-hidden", "true");
        }

        function applyTimeSignature(signatureRaw) {
          const active = getActiveSong();
          if (!active) return { ok: false, changed: false, message: "No active song." };

          const strict = parseTimeSignatureStrict(signatureRaw);
          if (!strict.ok) return { ok: false, changed: false, message: strict.message };

          const nextLabel = strict.label;
          const changed = active.timeSignature !== nextLabel;

          if (changed) {
            state.songs = state.songs.map((song) => {
              if (song.id !== active.id) return song;
              const defaultAccentBeats = getAccentBeatsForSignature(nextLabel);
              return {
                ...song,
                timeSignature: nextLabel,
                useAccents: false,
                accentBeats: normalizeAccentBeats(defaultAccentBeats, strict.beatsPerBar, defaultAccentBeats)
              };
            });
            saveSongs();
          }

          renderAll();

          if (changed && state.isPlaying) {
            restartMetronome().catch((error) => console.error("Restart failed", error));
          }

          return { ok: true, changed, label: nextLabel };
        }

        function applyPresetTimeSignature(label) {
          state.timeSignatureMenuOpen = false;
          state.customSignaturePanelOpen = false;
          applyTimeSignature(label);
        }

        function openCustomSignaturePanel() {
          const active = getActiveSong();
          if (!active) return;
          state.timeSignatureMenuOpen = true;
          state.customSignaturePanelOpen = true;
          setCustomSignatureInputsFromLabel(parseTimeSignature(active.timeSignature).label);
          clearCustomSignatureError();
          renderLivePanel();

          requestAnimationFrame(() => {
            els.customSignatureNumeratorInput.focus();
            els.customSignatureNumeratorInput.select();
          });
        }

        function applyCustomSignature() {
          const parsedInputs = getCustomSignatureCandidateFromInputs();
          if (!parsedInputs.ok) {
            setCustomSignatureError(parsedInputs.message);
            return;
          }
          const strict = parsedInputs.strict;

          state.timeSignatureMenuOpen = false;
          state.customSignaturePanelOpen = false;
          applyTimeSignature(strict.label);
        }

        function openDeleteConfirmModal(songId) {
          const song = state.songs.find((item) => item.id === songId);
          if (!song) return;

          state.pendingDeleteSongId = song.id;
          const songLabel = String(song.name || "").trim() || "Untitled";
          const onlySongLeft = state.songs.length <= 1;
          els.deleteConfirmMessage.textContent = onlySongLeft
            ? `Delete "${songLabel}"? This will reset the setlist to default.`
            : `Delete "${songLabel}" from the setlist?`;

          els.deleteConfirmModal.classList.remove("hidden");
          els.deleteConfirmModal.classList.add("flex");
          els.deleteConfirmModal.setAttribute("aria-hidden", "false");
        }

        function closeDeleteConfirmModal() {
          state.pendingDeleteSongId = null;
          els.deleteConfirmModal.classList.remove("flex");
          els.deleteConfirmModal.classList.add("hidden");
          els.deleteConfirmModal.setAttribute("aria-hidden", "true");
        }

        function requestDeleteSong(songId) {
          openDeleteConfirmModal(songId);
        }

        function confirmDeleteSong() {
          const songId = state.pendingDeleteSongId;
          closeDeleteConfirmModal();
          if (!songId) return;

          const song = state.songs.find((item) => item.id === songId);
          if (!song) return;

          const wasPlaying = state.isPlaying;

          if (state.songs.length <= 1) {
            if (wasPlaying) {
              stopMetronome();
            }
            resetToDefaultSetlist();
            saveSongs();
            renderAll();
            if (wasPlaying) {
              startMetronome().catch((error) => console.error("Restart failed", error));
            }
            return;
          }

          const index = state.songs.findIndex((item) => item.id === songId);
          state.songs = state.songs.filter((item) => item.id !== songId);

          if (state.activeSongId === songId) {
            const fallback = state.songs[Math.min(index, state.songs.length - 1)];
            state.activeSongId = fallback.id;
            state.titleEditSongId = null;
            state.timeSignatureMenuOpen = false;
          }

          saveSongs();
          renderAll();

          if (wasPlaying) {
            restartMetronome().catch((error) => console.error("Restart failed", error));
          }
        }

        function clearSetlist() {
          openClearConfirmModal();
        }

        function confirmClearSetlist() {
          closeClearConfirmModal();

          if (state.isPlaying) {
            stopMetronome();
          }

          resetToDefaultSetlist();
          saveSongs();
          renderAll();
        }

        function selectSong(songId) {
          if (!state.songs.some((song) => song.id === songId)) return;
          state.activeSongId = songId;
          state.titleEditSongId = null;
          state.timeSignatureMenuOpen = false;
          const active = getActiveSong();
          if (active) {
            state.customSignaturePanelOpen = !isPresetTimeSignature(parseTimeSignature(active.timeSignature).label);
          }
          saveSongs();
          renderAll();

          if (state.isPlaying) {
            restartMetronome().catch((error) => console.error("Restart failed", error));
          }
        }

        function goToAdjacentSong(direction) {
          if (!state.songs.length) return;
          const currentIndex = state.songs.findIndex((song) => song.id === state.activeSongId);
          const safeIndex = currentIndex >= 0 ? currentIndex : 0;
          const maxIndex = state.songs.length - 1;
          const nextIndex = Math.min(maxIndex, Math.max(0, safeIndex + direction));
          if (nextIndex === safeIndex) return;
          selectSong(state.songs[nextIndex].id);
        }

        function updateActiveSongBpm(nextBpm) {
          const active = getActiveSong();
          if (!active) return false;
          const clamped = clampBpm(nextBpm);
          if (clamped === active.bpm) return false;

          state.songs = state.songs.map((song) => {
            if (song.id !== active.id) return song;
            return { ...song, bpm: clamped };
          });
          saveSongs();
          renderAll();

          if (state.isPlaying && clamped <= 0) {
            stopMetronome();
            setWakeLockStatus("Set BPM above 0");
          }

          return true;
        }

        function adjustActiveBpm(delta) {
          if (delta === 0) return;
          const active = getActiveSong();
          if (!active) return;
          updateActiveSongBpm(active.bpm + delta);
        }

        function updateActiveSongRhythmOptions(nextOptions) {
          const active = getActiveSong();
          if (!active) return false;
          const activeUseAccents = toBoolean(active.useAccents);
          const activeDoubleTime = toBoolean(active.doubleTime);

          const parsed = parseTimeSignature(active.timeSignature);
          const defaultAccentBeats = getAccentBeatsForSignature(parsed.label);
          const currentAccentBeats = normalizeAccentBeats(active.accentBeats, parsed.beatsPerBar, defaultAccentBeats);
          const nextUseAccents = typeof nextOptions.useAccents === "boolean" ? nextOptions.useAccents : activeUseAccents;
          const nextDoubleTime = typeof nextOptions.doubleTime === "boolean" ? nextOptions.doubleTime : activeDoubleTime;
          const nextAccentBeats =
            nextOptions.accentBeats === undefined
              ? currentAccentBeats
              : normalizeAccentBeats(nextOptions.accentBeats, parsed.beatsPerBar, defaultAccentBeats);
          const accentBeatsUnchanged =
            currentAccentBeats.length === nextAccentBeats.length &&
            currentAccentBeats.every((beat, index) => beat === nextAccentBeats[index]);

          if (nextUseAccents === activeUseAccents && nextDoubleTime === activeDoubleTime && accentBeatsUnchanged) {
            return false;
          }

          state.songs = state.songs.map((song) => {
            if (song.id !== active.id) return song;
            return {
              ...song,
              useAccents: nextUseAccents,
              doubleTime: nextDoubleTime,
              accentBeats: nextAccentBeats
            };
          });
          saveSongs();
          renderAll();

          if (state.isPlaying) {
            restartMetronome().catch((error) => console.error("Restart failed", error));
          }
          return true;
        }

        function toggleActiveSongAccents() {
          const active = getActiveSong();
          if (!active) return;
          updateActiveSongRhythmOptions({ useAccents: !toBoolean(active.useAccents) });
        }

        function toggleActiveSongDoubleTime() {
          const active = getActiveSong();
          if (!active) return;
          updateActiveSongRhythmOptions({ doubleTime: !toBoolean(active.doubleTime) });
        }

        function toggleActiveSongAccentBeat(beatNumber) {
          const active = getActiveSong();
          if (!active) return;

          const parsed = parseTimeSignature(active.timeSignature);
          const defaultAccentBeats = getAccentBeatsForSignature(parsed.label);
          const currentAccentBeats = normalizeAccentBeats(active.accentBeats, parsed.beatsPerBar, defaultAccentBeats);
          if (!toBoolean(active.useAccents)) {
            const nextAccentBeats = [...new Set([...currentAccentBeats, beatNumber])].sort((a, b) => a - b);
            updateActiveSongRhythmOptions({ useAccents: true, accentBeats: nextAccentBeats });
            return;
          }

          const hasBeat = currentAccentBeats.includes(beatNumber);
          const nextAccentBeats = hasBeat
            ? currentAccentBeats.filter((beat) => beat !== beatNumber)
            : [...currentAccentBeats, beatNumber].sort((a, b) => a - b);

          if (nextAccentBeats.length === 0) {
            updateActiveSongRhythmOptions({ useAccents: false, accentBeats: defaultAccentBeats });
            return;
          }

          updateActiveSongRhythmOptions({ useAccents: true, accentBeats: nextAccentBeats });
        }

        function getRollerAngle(event) {
          const rect = els.bpmRoller.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          return (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
        }

        function normalizeAngleDelta(delta) {
          let normalized = delta;
          while (normalized > 180) normalized -= 360;
          while (normalized < -180) normalized += 360;
          return normalized;
        }

        function onRollerPointerDown(event) {
          if (!getActiveSong()) return;
          state.knobDragActive = true;
          state.knobLastAngle = getRollerAngle(event);
          state.knobRemainder = 0;
          els.bpmRoller.setPointerCapture(event.pointerId);
          event.preventDefault();
        }

        function onRollerPointerMove(event) {
          if (!state.knobDragActive) return;
          const angle = getRollerAngle(event);
          const deltaAngle = normalizeAngleDelta(angle - state.knobLastAngle);
          state.knobLastAngle = angle;
          state.knobRemainder += deltaAngle;

          const degreesPerBpm = 360 / Math.max(1, BPM_MAX - BPM_MIN);
          let bpmDelta = 0;
          while (state.knobRemainder >= degreesPerBpm) {
            bpmDelta += 1;
            state.knobRemainder -= degreesPerBpm;
          }
          while (state.knobRemainder <= -degreesPerBpm) {
            bpmDelta -= 1;
            state.knobRemainder += degreesPerBpm;
          }

          if (bpmDelta !== 0) {
            adjustActiveBpm(bpmDelta);
          }

          event.preventDefault();
        }

        function onRollerPointerEnd(event) {
          if (!state.knobDragActive) return;
          state.knobDragActive = false;
          state.knobRemainder = 0;
          if (event.pointerId !== undefined && els.bpmRoller.hasPointerCapture(event.pointerId)) {
            els.bpmRoller.releasePointerCapture(event.pointerId);
          }
        }

        function onRollerWheel(event) {
          if (!getActiveSong()) return;
          event.preventDefault();
          if (event.deltaY < 0) {
            adjustActiveBpm(1);
          } else if (event.deltaY > 0) {
            adjustActiveBpm(-1);
          }
        }

        function onRollerKeydown(event) {
          if (!getActiveSong()) return;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            adjustActiveBpm(1);
            return;
          }
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            adjustActiveBpm(-1);
            return;
          }
          if (event.key === "PageUp") {
            event.preventDefault();
            adjustActiveBpm(10);
            return;
          }
          if (event.key === "PageDown") {
            event.preventDefault();
            adjustActiveBpm(-10);
          }
        }

        async function ensureAudioContext() {
          if (!state.audioContext) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) {
              throw new Error("Web Audio API is not supported in this browser.");
            }
            state.audioContext = new Ctx();
          }

          if (state.audioContext.state === "suspended") {
            await state.audioContext.resume();
          }
        }

        function scheduleClick(noteTime, isAccented) {
          const ctx = state.audioContext;
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();

          oscillator.type = "square";
          oscillator.frequency.value = isAccented ? 1900 : 1300;

          gainNode.gain.setValueAtTime(0.0001, noteTime);
          gainNode.gain.exponentialRampToValueAtTime(isAccented ? 0.28 : 0.18, noteTime + 0.001);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.04);

          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);

          oscillator.start(noteTime);
          oscillator.stop(noteTime + 0.05);
        }

        function clearBeatIndicatorHighlight() {
          els.accentBeatButtons
            .querySelectorAll(".is-current-beat, .is-current-accent")
            .forEach((node) => node.classList.remove("is-current-beat", "is-current-accent"));
        }

        function queueBeatIndicatorPulse(noteTime, beatInBar, isAccented) {
          const ctx = state.audioContext;
          const delayMs = Math.max(0, (noteTime - ctx.currentTime) * 1000);
          const beatNumber = beatInBar + 1;
          const timeoutId = window.setTimeout(() => {
            if (!state.isPlaying) return;

            const beatButton = els.accentBeatButtons.querySelector(`[data-accent-beat="${beatNumber}"]`);
            if (!beatButton) return;

            clearBeatIndicatorHighlight();
            beatButton.classList.add("is-current-beat");
            if (isAccented) {
              beatButton.classList.add("is-current-accent");
            }

            const releaseId = window.setTimeout(() => {
              beatButton.classList.remove("is-current-beat", "is-current-accent");
            }, 80);
            state.visualTimers.push(releaseId);
          }, delayMs);

          state.visualTimers.push(timeoutId);
        }

        function clearVisualTimers() {
          state.visualTimers.forEach((id) => window.clearTimeout(id));
          state.visualTimers = [];
          clearBeatIndicatorHighlight();
        }

        function nextNote() {
          const active = getActiveSong();
          if (!active) return;

          const safeBpm = Math.max(1, active.bpm);
          const multiplier = active.doubleTime ? 2 : 1;
          const secondsPerTick = 60 / (safeBpm * multiplier);
          state.nextNoteTime += secondsPerTick;
          state.currentBeat = (state.currentBeat + 1) % state.activeBeatsPerBar;
        }

        function scheduleNote(beatInBar, noteTime) {
          const active = getActiveSong();
          if (!active) return;

          const parsed = parseTimeSignature(active.timeSignature);
          const isAccented = isAccentStepInBar(beatInBar, active, parsed);
          scheduleClick(noteTime, isAccented);
          queueBeatIndicatorPulse(noteTime, beatInBar, isAccented);
        }

        function scheduler() {
          if (!state.isPlaying || !state.audioContext) return;

          while (state.nextNoteTime < state.audioContext.currentTime + scheduleAheadTime) {
            scheduleNote(state.currentBeat, state.nextNoteTime);
            nextNote();
          }

          state.schedulerTimer = window.setTimeout(scheduler, lookaheadMs);
        }

        async function startMetronome() {
          const active = getActiveSong();
          if (!active || state.isPlaying) return;

          if (active.bpm <= 0) {
            setWakeLockStatus("Set BPM above 0");
            return;
          }

          await ensureAudioContext();
          const parsed = parseTimeSignature(active.timeSignature);
          state.activeBeatsPerBar = parsed.beatsPerBar;
          state.currentBeat = 0;
          state.nextNoteTime = state.audioContext.currentTime + 0.05;
          state.isPlaying = true;
          els.playBtn.textContent = "⏸";
          els.playBtn.classList.add("is-active");
          clearVisualTimers();
          scheduler();
          await requestWakeLock();
        }

        function stopMetronome() {
          if (!state.isPlaying) return;

          state.isPlaying = false;

          if (state.schedulerTimer !== null) {
            window.clearTimeout(state.schedulerTimer);
            state.schedulerTimer = null;
          }

          clearVisualTimers();

          els.playBtn.textContent = "▶";
          els.playBtn.classList.remove("is-active");
          releaseWakeLock();
        }

        async function toggleMetronome() {
          if (state.isPlaying) {
            stopMetronome();
          } else {
            try {
              await startMetronome();
            } catch (error) {
              console.error("Could not start metronome", error);
            }
          }
        }

        async function restartMetronome() {
          if (!state.isPlaying) return;
          stopMetronome();
          await startMetronome();
        }

        async function requestWakeLock() {
          if (!("wakeLock" in navigator)) {
            setWakeLockStatus("Wake lock: unsupported");
            return;
          }

          if (state.wakeLock && !state.wakeLock.released) {
            setWakeLockStatus("Wake lock: active");
            return;
          }

          try {
            state.wakeLock = await navigator.wakeLock.request("screen");
            setWakeLockStatus("Wake lock: active");
            state.wakeLock.addEventListener("release", () => {
              state.wakeLock = null;
              setWakeLockStatus(state.isPlaying ? "Wake lock: released" : "Wake lock: idle");
            });
          } catch (error) {
            console.warn("Wake lock request failed", error);
            setWakeLockStatus("Wake lock: blocked");
          }
        }

        function releaseWakeLock() {
          if (!state.wakeLock) {
            setWakeLockStatus("Wake lock: idle");
            return;
          }

          state.wakeLock.release().catch(() => {});
          state.wakeLock = null;
          setWakeLockStatus("Wake lock: idle");
        }

        function onVisibilityChange() {
          if (document.visibilityState === "visible" && state.isPlaying) {
            requestWakeLock();
          }
        }

        function bindEvents() {
          els.currentSongTitle.addEventListener("click", openTitleEditor);
          els.currentSongTitle.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openTitleEditor();
            }
          });
          els.songTitleEditInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              closeTitleEditor(true);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              closeTitleEditor(false);
              return;
            }

            const isTextKey =
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey;
            if (!isTextKey) return;

            const selectionStart = els.songTitleEditInput.selectionStart ?? els.songTitleEditInput.value.length;
            const selectionEnd = els.songTitleEditInput.selectionEnd ?? els.songTitleEditInput.value.length;
            const replacingLength = Math.max(0, selectionEnd - selectionStart);
            const projectedLength = els.songTitleEditInput.value.length - replacingLength + 1;
            if (projectedLength > SONG_TITLE_MAX_LENGTH) {
              showSongTitleLimitInfo();
            }
          });
          els.songTitleEditInput.addEventListener("beforeinput", (event) => {
            const inputType = event.inputType || "";
            if (!inputType.startsWith("insert")) return;

            const currentValue = els.songTitleEditInput.value;
            const selectionStart = els.songTitleEditInput.selectionStart ?? currentValue.length;
            const selectionEnd = els.songTitleEditInput.selectionEnd ?? currentValue.length;
            const replacingLength = Math.max(0, selectionEnd - selectionStart);
            const insertedLength = event.data ? event.data.length : 1;
            const projectedLength = currentValue.length - replacingLength + insertedLength;
            if (projectedLength > SONG_TITLE_MAX_LENGTH) {
              showSongTitleLimitInfo();
            }
          });
          els.songTitleEditInput.addEventListener("paste", (event) => {
            const pastedText = event.clipboardData ? event.clipboardData.getData("text") : "";
            const currentValue = els.songTitleEditInput.value;
            const selectionStart = els.songTitleEditInput.selectionStart ?? currentValue.length;
            const selectionEnd = els.songTitleEditInput.selectionEnd ?? currentValue.length;
            const replacingLength = Math.max(0, selectionEnd - selectionStart);
            const projectedLength = currentValue.length - replacingLength + pastedText.length;
            if (projectedLength > SONG_TITLE_MAX_LENGTH) {
              showSongTitleLimitInfo();
            }
          });
          els.songTitleEditInput.addEventListener("input", () => {
            const clampedValue = clampSongTitleInput(els.songTitleEditInput.value);
            if (clampedValue !== els.songTitleEditInput.value) {
              els.songTitleEditInput.value = clampedValue;
              showSongTitleLimitInfo();
            }
          });
          els.songTitleEditInput.addEventListener("blur", () => {
            if (state.titleEditSongId) {
              closeTitleEditor(true);
            }
          });

          els.timeSignatureLabel.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleTimeSignatureMenu();
          });
          els.timeSignatureMenu.addEventListener("click", (event) => {
            event.stopPropagation();
          });

          els.playBtn.addEventListener("click", toggleMetronome);
          els.prevBtn.addEventListener("click", (event) => {
            event.preventDefault();
            goToAdjacentSong(-1);
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.nextBtn.addEventListener("click", (event) => {
            event.preventDefault();
            goToAdjacentSong(1);
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.bpmMinus10Btn.addEventListener("click", (event) => {
            event.preventDefault();
            adjustActiveBpm(-10);
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.bpmMinus1Btn.addEventListener("click", (event) => {
            event.preventDefault();
            adjustActiveBpm(-1);
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.bpmPlus1Btn.addEventListener("click", (event) => {
            event.preventDefault();
            adjustActiveBpm(1);
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.bpmPlus10Btn.addEventListener("click", (event) => {
            event.preventDefault();
            adjustActiveBpm(10);
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.accentToggleBtn.addEventListener("click", (event) => {
            event.preventDefault();
            toggleActiveSongAccents();
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.doubleTimeToggleBtn.addEventListener("click", (event) => {
            event.preventDefault();
            toggleActiveSongDoubleTime();
            if (event.currentTarget && typeof event.currentTarget.blur === "function") {
              event.currentTarget.blur();
            }
          });
          els.accentBeatButtons.addEventListener("click", (event) => {
            const button = event.target.closest("[data-accent-beat]");
            if (!button) return;
            const beatNumber = Number.parseInt(button.getAttribute("data-accent-beat"), 10);
            if (!Number.isFinite(beatNumber)) return;
            toggleActiveSongAccentBeat(beatNumber);
          });
          els.ts44Btn.addEventListener("click", () => applyPresetTimeSignature("4/4"));
          els.ts68Btn.addEventListener("click", () => applyPresetTimeSignature("6/8"));
          els.ts34Btn.addEventListener("click", () => applyPresetTimeSignature("3/4"));
          els.tsCustomBtn.addEventListener("click", openCustomSignaturePanel);
          els.applyCustomSignatureBtn.addEventListener("click", applyCustomSignature);
          [els.customSignatureNumeratorInput, els.customSignatureDenominatorInput].forEach((input) => {
            input.addEventListener("keydown", (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyCustomSignature();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeTimeSignatureMenu();
              }
            });
          });
          els.customSignatureNumeratorInput.addEventListener("input", clearCustomSignatureError);
          els.customSignatureNumeratorInput.addEventListener("blur", () => {
            setCustomNumeratorValue(els.customSignatureNumeratorInput.value);
            clearCustomSignatureError();
          });
          els.customSignatureDenominatorInput.addEventListener("input", () => {
            clearCustomSignatureError();
          });
          els.customSignatureDenominatorInput.addEventListener("blur", () => {
            const snapped = getNearestAllowedCustomDenominator(els.customSignatureDenominatorInput.value);
            setCustomDenominatorValue(snapped);
            clearCustomSignatureError();
          });
          els.customSignaturePanel.addEventListener("click", (event) => {
            const numeratorStepButton = event.target.closest("[data-custom-numerator-step]");
            if (numeratorStepButton) {
              const direction = Number.parseInt(numeratorStepButton.getAttribute("data-custom-numerator-step"), 10);
              if (Number.isFinite(direction)) {
                stepCustomNumerator(direction);
              }
              return;
            }

            const denominatorStepButton = event.target.closest("[data-custom-denominator-step]");
            if (denominatorStepButton) {
              const direction = Number.parseInt(denominatorStepButton.getAttribute("data-custom-denominator-step"), 10);
              if (Number.isFinite(direction)) {
                stepCustomDenominator(direction);
              }
              return;
            }

          });
          els.bpmRoller.addEventListener("wheel", onRollerWheel, { passive: false });
          els.bpmRoller.addEventListener("pointerdown", onRollerPointerDown);
          els.bpmRoller.addEventListener("pointermove", onRollerPointerMove);
          els.bpmRoller.addEventListener("pointerup", onRollerPointerEnd);
          els.bpmRoller.addEventListener("pointercancel", onRollerPointerEnd);
          els.bpmRoller.addEventListener("keydown", onRollerKeydown);
          els.shareSetlistBtn.addEventListener("click", openShareSetlistModal);
          els.openImportSetlistBtn.addEventListener("click", () => openImportSetlistModal());
          els.clearSetlistBtn.addEventListener("click", clearSetlist);
          els.addSongBtn.addEventListener("click", addDefaultSong);
          els.cancelClearModalBtn.addEventListener("click", closeClearConfirmModal);
          els.confirmClearModalBtn.addEventListener("click", confirmClearSetlist);
          els.cancelDeleteModalBtn.addEventListener("click", closeDeleteConfirmModal);
          els.confirmDeleteModalBtn.addEventListener("click", confirmDeleteSong);
          els.closeShareModalBtn.addEventListener("click", closeShareSetlistModal);
          els.copyShareLinkBtn.addEventListener("click", copyShareLink);
          els.nativeShareLinkBtn.addEventListener("click", nativeShareLink);
          els.cancelImportModalBtn.addEventListener("click", closeImportSetlistModal);
          els.confirmImportModalBtn.addEventListener("click", confirmImportSetlist);
          els.importSetlistInput.addEventListener("input", clearImportSetlistError);
          els.importSetlistInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            if (!event.metaKey && !event.ctrlKey) return;
            event.preventDefault();
            confirmImportSetlist();
          });
          document.addEventListener("visibilitychange", onVisibilityChange);
          window.addEventListener("resize", () => {
            applyDeviceModeClass();
            renderLivePanel();
          });

          els.clearConfirmModal.addEventListener("click", (event) => {
            if (event.target === els.clearConfirmModal) {
              closeClearConfirmModal();
            }
          });
          els.deleteConfirmModal.addEventListener("click", (event) => {
            if (event.target === els.deleteConfirmModal) {
              closeDeleteConfirmModal();
            }
          });
          els.shareSetlistModal.addEventListener("click", (event) => {
            if (event.target === els.shareSetlistModal) {
              closeShareSetlistModal();
            }
          });
          els.importSetlistModal.addEventListener("click", (event) => {
            if (event.target === els.importSetlistModal) {
              closeImportSetlistModal();
            }
          });

          document.addEventListener("click", (event) => {
            if (!state.timeSignatureMenuOpen) return;
            if (event.target === els.timeSignatureLabel) return;
            if (els.timeSignatureMenu.contains(event.target)) return;
            closeTimeSignatureMenu();
          });

          document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;

            if (!els.deleteConfirmModal.classList.contains("hidden")) {
              closeDeleteConfirmModal();
              return;
            }

            if (!els.clearConfirmModal.classList.contains("hidden")) {
              closeClearConfirmModal();
              return;
            }

            if (!els.shareSetlistModal.classList.contains("hidden")) {
              closeShareSetlistModal();
              return;
            }

            if (!els.importSetlistModal.classList.contains("hidden")) {
              closeImportSetlistModal();
              return;
            }

            if (state.titleEditSongId) {
              closeTitleEditor(false);
              return;
            }

            if (state.timeSignatureMenuOpen) {
              closeTimeSignatureMenu();
            }
          });

          els.setlistContainer.addEventListener("click", (event) => {
            const card = event.target.closest("[data-song-id]");
            if (!card) return;

            const songId = card.getAttribute("data-song-id");
            if (!songId) return;

            if (event.target.closest(".song-delete")) {
              requestDeleteSong(songId);
              return;
            }

            if (event.target.closest(".song-select")) {
              selectSong(songId);
            }
          });
        }

        function renderAll() {
          renderLivePanel();
          renderSetlist();
          updateDocumentTitle();
        }

        function init() {
          registerServiceWorker();
          applyDeviceModeClass();
          loadSongs();
          els.bpmRollerDial.style.transform = "rotate(-90deg)";
          bindEvents();
          renderAll();
          maybeOpenImportFromUrlToken();
        }

        init();
      })();
