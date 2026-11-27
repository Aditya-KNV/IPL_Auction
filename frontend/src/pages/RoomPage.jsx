import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import CreateRoomForm from "../components/room/CreateRoomForm";
import JoinRoomForm from "../components/room/JoinRoomForm";
import RoomLobby from "../components/room/RoomLobby";
import AuctionBoard from "../components/auction/AuctionBoard";
import ThemeToggle from "../components/common/ThemeToggle";
import { useMyTeam } from "../hooks/useMyTeam";
import OtherTeamsPanel from "../components/auction/OtherTeamsPanel";
import MyTeamPanel from "../components/auction/MyTeamPanel";
import PlayerStatsModal from "../components/players/PlayerStatsModal";
import RankingPage from "./RankingPage";
import RatingFilters, { activeRatingFilters, meetsRatingFilters } from "../components/players/RatingFilters";
import api from "../services/api";
import { STATUS_COLOR, getDisplayStatus } from "../utils/playerDisplay";

function PlayersTab() {
  const { socket } = useSocket();
  const { room } = useRoom();
  const [players, setPlayers] = useState([]);
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [auctionSetName, setAuctionSetName] = useState("");
  const [setOptions, setSetOptions] = useState([]);
  const [ratingMins, setRatingMins] = useState({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  // Rating filters differ by role, so start afresh when it changes
  useEffect(() => {
    setRatingMins({});
  }, [role]);

  // Set names come from the room's players, so a new seed needs no code change.
  useEffect(() => {
    setAuctionSetName("");
    setSetOptions([]);
    if (!room?.code) return;
    api
      .get("/players/sets", { params: { roomCode: room.code } })
      .then((r) => setSetOptions(r.data))
      .catch(console.error);
  }, [room?.code]);

  const load = () => {
    const params = {};
    if (role) params.role = role;
    if (status) params.status = status;
    if (auctionSetName) params.auctionSetName = auctionSetName;
    if (room?.code) params.roomCode = room.code;
    api
      .get("/players", { params })
      .then((r) => setPlayers(r.data))
      .catch(console.error);
  };

  useEffect(() => {
    load();
  }, [role, status, auctionSetName, room?.code]);

  useEffect(() => {
    if (!socket) return;
    socket.on("auction:sold", load);
    socket.on("auction:unsold", load);
    return () => {
      socket.off("auction:sold", load);
      socket.off("auction:unsold", load);
    };
  }, [socket, role, status, auctionSetName, room?.code]);

  const ratingFilters = activeRatingFilters(role, ratingMins);

  const filtered = useMemo(() => {
    const active = activeRatingFilters(role, ratingMins);
    const q = search.trim().toLowerCase();
    return players.filter((p) =>
      meetsRatingFilters(p, active) && (!q || p.name.toLowerCase().includes(q)));
  }, [players, role, ratingMins, search]);

  const openPlayer = async (id) => {
    setLoadingPlayer(true);
    try {
      const { data } = await api.get(`/players/${id}`, { params: room?.code ? { roomCode: room.code } : {} });
      setSelected(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlayer(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-3 md:p-6">
      {selected && (
        <PlayerStatsModal player={selected} onClose={() => setSelected(null)} />
      )}
      {loadingPlayer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <svg className="h-8 w-8 animate-spin text-neon" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}

      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[3px] text-white/25 mb-1">Roster</p>
        <h2 className="font-bebas text-3xl tracking-wider text-white">Players</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 md:flex md:flex-wrap">
        {/* Search */}
        <div className="col-span-2 flex items-center gap-2 bg-surface-2 border border-white/[0.08] rounded-lg px-3 py-2">
          <svg className="h-4 w-4 text-white/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player…"
            className="bg-transparent text-white text-sm outline-none flex-1 min-w-0 md:w-36 placeholder-white/20" />
          {search && (
            <button onClick={() => setSearch("")} className="text-white/30 hover:text-white ml-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="bg-surface-2 border border-white/[0.08] text-white/70 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-neon/40">
          <option value="">All Roles</option>
          {["Batsman", "Bowler", "All-Rounder", "Wicket-Keeper"].map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-surface-2 border border-white/[0.08] text-white/70 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-neon/40">
          <option value="">All Status</option>
          {["available", "sold", "unsold", "in-auction"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={auctionSetName} onChange={(e) => setAuctionSetName(e.target.value)}
          className="bg-surface-2 border border-white/[0.08] text-white/70 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-neon/40">
          <option value="">All Sets</option>
          {setOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {(role || status || auctionSetName || search || ratingFilters.length > 0) && (
          <button onClick={() => { setRole(""); setStatus(""); setAuctionSetName(""); setRatingMins({}); setSearch(""); }}
            className="text-xs text-white/30 border border-white/[0.06] rounded-lg px-3 py-2 hover:border-white/15 hover:text-white transition">
            Clear filters
          </button>
        )}
      </div>

      {role && (
        <div className="mb-4">
          <RatingFilters role={role} mins={ratingMins} onChange={setRatingMins} />
        </div>
      )}

      <p className="text-white/25 text-xs mb-3">
        {filtered.length} player{filtered.length !== 1 ? "s" : ""}
        {ratingFilters.length > 0 && (
          <span className="ml-1 text-neon">
            · {ratingFilters.map((f) => `${f.label} ≥ ${f.min}`).join(" · ")}
          </span>
        )}
      </p>

      {/* Phone list */}
      <ul className="md:hidden rounded-xl border border-white/[0.06] divide-y divide-white/[0.06]">
        {filtered.map(p => {
          const displayStatus = getDisplayStatus(p);
          return (
            <li key={p._id}>
              <button onClick={() => openPlayer(p._id)}
                className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left active:bg-white/[0.05]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{p.name}</span>
                  <span className="block truncate text-xs text-white/40">
                    {p.role} · {p.nationality}
                  </span>
                  {ratingFilters.length > 0 && (
                    <span className="block text-xs text-blue-300">
                      {ratingFilters.map((f) => `${f.label} ${f.value(p)}`).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="flex-shrink-0 text-right">
                  <span className={`block text-xs font-semibold capitalize ${STATUS_COLOR[displayStatus] || "text-white/30"}`}>
                    {displayStatus}{p.team?.shortName ? ` · ${p.team.shortName}` : ""}
                  </span>
                  <span className="block text-xs text-white/40 tabular-nums">
                    {p.soldPrice ? `₹${p.soldPrice} Cr` : `Base ₹${p.basePrice} Cr`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="py-10 text-center text-sm text-white/20">No players found</li>}
      </ul>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-white/30 bg-surface/60">
              <th className="text-left py-3 px-4 font-semibold">Player</th>
              <th className="text-left py-3 px-4 font-semibold">Set</th>
              <th className="text-left py-3 px-4 font-semibold">Role</th>
              <th className="text-left py-3 px-4 font-semibold">Nationality</th>
              <th className="text-right py-3 px-4 font-semibold">Base (Cr)</th>
              <th className="text-right py-3 px-4 font-semibold">Sold (Cr)</th>
              {ratingFilters.map((f) => (
                <th key={f.key} className="text-right py-3 px-4 font-semibold whitespace-nowrap">{f.label}</th>
              ))}
              <th className="text-left py-3 px-4 font-semibold">Team</th>
              <th className="text-left py-3 px-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const displayStatus = getDisplayStatus(p);
              return (
                <tr key={p._id} onClick={() => openPlayer(p._id)}
                  className="border-b border-white/[0.04] hover:bg-white/[0.03] transition cursor-pointer">
                  <td className="py-3 px-4 font-semibold text-white">{p.name}</td>
                  <td className="py-3 px-4 text-white/40">{p.auctionSetName || "—"}</td>
                  <td className="py-3 px-4 text-white/60">{p.role}</td>
                  <td className="py-3 px-4 text-white/40">{p.nationality}</td>
                  <td className="py-3 px-4 text-right text-white/50">₹{p.basePrice}</td>
                  <td className="py-3 px-4 text-right text-neon font-semibold">{p.soldPrice ? `₹${p.soldPrice}` : "—"}</td>
                  {ratingFilters.map((f) => (
                    <td key={f.key} className="py-3 px-4 text-right font-semibold text-blue-300">
                      {f.value(p)}/10
                    </td>
                  ))}
                  <td className="py-3 px-4 text-white/50">{p.team?.shortName || "—"}</td>
                  <td className={`py-3 px-4 font-semibold capitalize ${STATUS_COLOR[displayStatus] || "text-white/30"}`}>
                    {displayStatus}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8 + ratingFilters.length} className="py-10 text-center text-white/20">No players found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamsTab() {
  const { user } = useAuth();
  const { teamAssignments } = useRoom();
  const { myTeam, allTeams, squadByRole, loading } = useMyTeam();

  const myTeamId = user ? (teamAssignments?.[user.id]?.teamId ?? null) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-white/30">Loading teams…</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[3px] text-white/25 mb-1">Squads</p>
        <h2 className="font-bebas text-3xl tracking-wider text-white">Teams</h2>
      </div>

      {myTeam && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-[3px] text-white/25 mb-2">
            My Team
          </p>
          <MyTeamPanel team={myTeam} squadByRole={squadByRole} />
        </div>
      )}

      <div>
        <OtherTeamsPanel teams={allTeams} myTeamId={myTeamId} teamAssignments={teamAssignments} />
      </div>
    </div>
  );
}

function SettingsTab() {
  const { room, transferHost } = useRoom();
  const { socket } = useSocket();
  const { user } = useAuth();
  const [timerDuration, setTimerDuration] = useState(10);
  const [timerSaved, setTimerSaved] = useState(false);
  const [selectedSocketId, setSelectedSocketId] = useState("");

  const mySocketId = socket?.id;
  const amHost = user?.id != null && room?.hostUserId === String(user.id);

  // Load current timer duration from session
  useEffect(() => {
    api
      .get("/auction/session")
      .then((r) => {
        if (r.data?.timerDuration) setTimerDuration(r.data.timerDuration);
      })
      .catch(() => {});
  }, []);

  // Keep timer in sync when host changes it
  useEffect(() => {
    if (!socket) return;
    const onTimerUpdated = ({ timerDuration: d }) => setTimerDuration(d);
    socket.on("settings:timer-updated", onTimerUpdated);
    return () => socket.off("settings:timer-updated", onTimerUpdated);
  }, [socket]);

  const saveTimer = () => {
    socket?.emit("settings:update-timer", { duration: timerDuration });
    setTimerSaved(true);
    setTimeout(() => setTimerSaved(false), 2000);
  };

  const handleTransferHost = () => {
    if (!selectedSocketId) return;
    transferHost(selectedSocketId);
    setSelectedSocketId("");
  };

  const otherUsers = room?.users.filter((u) => u.socketId !== mySocketId) || [];

  return (
    <div className="max-w-2xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[3px] text-white/25 mb-1">Configuration</p>
        <h2 className="font-bebas text-3xl tracking-wider text-white">Settings</h2>
      </div>

      {!amHost && (
        <div className="rounded-xl border border-white/[0.06] bg-surface p-4 text-center text-white/30 text-sm">
          Only the host can change room settings.
        </div>
      )}

      {/* Timer */}
      <div className={`bg-surface border rounded-2xl p-6 ${amHost ? "border-white/[0.08]" : "border-white/[0.04] opacity-40 pointer-events-none"}`}>
        <h3 className="text-white/60 text-xs font-black uppercase tracking-widest mb-1">Auction Timer</h3>
        <p className="text-white/25 text-xs mb-4">
          Initial bidding window duration when a player enters auction. Each bid extends the clock by 10 s regardless.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input type="range" min={5} max={120} step={5} value={timerDuration}
            onChange={(e) => setTimerDuration(Number(e.target.value))}
            className="basis-full sm:basis-0 sm:flex-1 accent-neon" />
          <div className="flex items-center gap-1 bg-surface-2 border border-white/[0.08] rounded-lg px-3 py-2">
            <input type="number" min={5} max={120} step={1} value={timerDuration}
              onChange={(e) => setTimerDuration(Number(e.target.value))}
              className="bg-transparent text-white text-sm w-10 outline-none text-center tabular-nums" />
            <span className="text-white/30 text-sm">s</span>
          </div>
          <button onClick={saveTimer}
            className="bg-neon text-black font-bold px-4 py-2 rounded-xl text-sm hover:brightness-110 transition">
            {timerSaved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Transfer Host */}
      <div className={`bg-surface border rounded-2xl p-6 ${amHost ? "border-white/[0.08]" : "border-white/[0.04] opacity-40 pointer-events-none"}`}>
        <h3 className="text-white/60 text-xs font-black uppercase tracking-widest mb-1">Transfer Host</h3>
        <p className="text-white/25 text-xs mb-4">
          Hand off host controls to another user in the room. You will become a regular participant.
        </p>
        {otherUsers.length === 0 ? (
          <p className="text-white/20 text-sm text-center py-2">No other users in the room.</p>
        ) : (
          <div className="flex items-center gap-3">
            <select value={selectedSocketId} onChange={(e) => setSelectedSocketId(e.target.value)}
              className="flex-1 bg-surface-2 border border-white/[0.08] text-white/70 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-neon/40">
              <option value="">Select user…</option>
              {otherUsers.map(u => <option key={u.socketId} value={u.socketId}>{u.username}</option>)}
            </select>
            <button onClick={handleTransferHost} disabled={!selectedSocketId}
              className="border border-white/[0.1] bg-surface-2 text-white/60 font-bold px-4 py-2 rounded-xl text-sm
                         hover:border-neon/40 hover:text-neon transition disabled:opacity-40 disabled:cursor-not-allowed">
              Transfer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Icon paths for the phone tab bar.
const TAB_ICONS = {
  Lobby:    "M3 11.5 12 4l9 7.5M5.5 10v10h13V10",
  Auction:  "m14 5 5 5m-7-3 5 5M11.5 8.500 6 14l4 4 5.500-5.500M4 21h10m-6.500-6.500L4 18",
  Teams:    "M16 19v-1.500a3.500 3.500 0 0 0-3.500-3.500h-5A3.500 3.500 0 0 0 4 17.500V19m6-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 8v-1.500a3.500 3.500 0 0 0-2.500-3.360M15 5.150a3 3 0 0 1 0 5.700",
  Players:  "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.300 3.100-5.500 7-5.500s7 2.200 7 5.500",
  Rankings: "M5 20v-7h4v7m1 0V5h4v15m1 0v-10h4v10M3 20h18",
  Rules:    "M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h3",
  Settings: "M4 7h10m4 0h2M4 17h4m4 0h8M16 5v4M10 15v4",
};

const TABS = [
  "Lobby",
  "Auction",
  "Teams",
  "Players",
  "Rankings",
  "Rules",
  "Settings",
];

function RulesTab() {
  const Section = ({ title, children }) => (
    <div className="bg-surface border border-white/[0.06] rounded-2xl p-6 mb-6">
      <h2 className="text-neon font-bold text-sm uppercase tracking-wider mb-4 border-b border-white/[0.06] pb-3">
        {title}
      </h2>
      {children}
    </div>
  );

  const Table = ({ headers, rows }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {headers.map(h => (
              <th key={h} className="text-left text-white/30 font-semibold py-2 pr-4 text-xs uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04]">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-white/60 text-sm">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <p className="text-[10px] font-black uppercase tracking-[3px] text-white/25 mb-1">Reference</p>
      <h1 className="font-bebas text-4xl tracking-wider text-white mb-2">Rules & Rating Schema</h1>
      <p className="text-white/40 text-sm mb-8">
        Complete reference for how bidding, budgets, squads, and player scores are calculated.
      </p>

      {/* ── BIDDING RULES ── */}
      <Section title="Bidding Rules">
        <Table
          headers={["Rule", "Value"]}
          rows={[
            ["Minimum bid increment", "0.2 Crores (20 Lakhs)"],
            ["Quick bid buttons", "+0.2 Cr, +0.5 Cr, +1 Cr"],
            [
              "First bid",
              "Must be ≥ player's base price (no increment needed)",
            ],
            ["Subsequent bids", "Must be ≥ current bid + 0.2 Cr"],
            [
              "Bid timer",
              "10 seconds default (configurable 5–120s, host only)",
            ],
            ["Timer reset", "Each valid bid resets the countdown"],
            [
              "Withdrawal",
              "Highest bidder cannot withdraw; others can at any time",
            ],
            ["All withdraw", "Player marked UNSOLD"],
            ["One team left", "Player SOLD to remaining bidder"],
          ]}
        />
      </Section>

      {/* ── TEAM BUDGET ── */}
      <Section title="Team Budget & Purse">
        <Table
          headers={["Rule", "Value"]}
          rows={[
            ["Starting purse per team", "120 Crores"],
            ["Purse deduction", "Exact final bid amount (2 decimal places)"],
            ["Bid blocked when", "remaining purse < bid amount"],
            ["Purse on reset", "Restored to full 120 Crores"],
          ]}
        />
      </Section>

      {/* ── SQUAD COMPOSITION ── */}
      <Section title="Squad Composition Rules">
        <Table
          headers={["Rule", "Value"]}
          rows={[
            ["Max squad size", "25 players"],
            ["Playing-12 size", "Exactly 12"],
            ["Max overseas in Playing-12", "4"],
            ["Max overseas in squad (≤18 player cap)", "6"],
            ["Max overseas in squad (25 player cap)", "8"],
            ["Min Indian players for full Playing-12", "8"],
            [
              "Overseas definition",
              "Any player whose nationality ≠ Indian (case-insensitive)",
            ],
          ]}
        />
      </Section>

      {/* ── PLAYER ROLES ── */}
      <Section title="Player Roles & Batting Positions">
        <Table
          headers={["Role", "Bats at", "Bowls"]}
          rows={[
            ["Batsman", "1–8", "Optional — if tactical.overs > 0"],
            ["Bowler", "9–12 only", "Yes (always has overs)"],
            ["All-Rounder", "1–9", "Yes (always has overs)"],
            ["Wicket-Keeper", "1–8", "No"],
          ]}
        />
        <p className="text-white/25 text-xs mt-3">
          Any player with{" "}
          <span className="font-mono text-white/50">tactical.overs &gt; 0</span>{" "}
          is included in bowling calculations regardless of role. All individual
          ratings are on a 0–10 scale.
        </p>
      </Section>

      {/* ── TEAM SCORE OVERVIEW ── */}
      <Section title="Team Score Overview (0–100)">
        <p className="text-white/60 text-sm mb-4">
          Final team score is the sum of 7 components:
        </p>
        <div className="bg-surface-2/60 rounded-xl p-4 font-mono text-sm text-neon mb-4">
          Final Score = Batting + Bowling + Fitness + Impact + Tactical + Age +
          Captaincy
        </div>
        <Table
          headers={["Component", "Max Points", "Formula"]}
          rows={[
            [
              "Batting",
              "40",
              "Keeper Score + Left-Right Balance + Position Fit",
            ],
            [
              "Bowling",
              "40",
              "Overs + Pace + Spin + Powerplay + Middle + Death phases",
            ],
            ["Fitness", "5", "avg(stamina, 10 − injury_risk) × 0.5"],
            ["Impact", "7", "avg(match_winner, clutch, consistency) × 0.7"],
            ["Tactical", "3", "avg(flexibility of all players) × 0.3"],
            [
              "Age",
              "1",
              "clamp(1 − |avg_age − 30| / 15, 0, 1)  —  optimal age = 30",
            ],
            [
              "Captaincy",
              "4",
              "Stepped by 0.5 pts per 0.25 drop below total captaincy of 1.51 — see table below",
            ],
          ]}
        />
      </Section>

      {/* ── BATTING SCORING ── */}
      <Section title="Batting Score Breakdown">
        <h3 className="text-white font-semibold text-sm mb-2">
          1. Wicket-Keeper Score (Max 3 pts)
        </h3>
        <Table
          headers={["Condition", "Points"]}
          rows={[
            ["2+ keepers in squad", "3.0"],
            ["1 keeper, injury risk ≤ 3", "2.5"],
            ["1 keeper, normal risk", "2.0"],
            ["No keeper", "0"],
          ]}
        />

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">
          2. Left-Right Balance (Max 3 pts)
        </h3>
        <div className="bg-surface-2/60 rounded-xl px-4 py-3 font-mono text-sm text-neon mb-1">
          Score = 3 × (min(left, right) / max(left, right))
        </div>
        <p className="text-white/25 text-xs">
          Counts batters and all-rounders only. Zero if only one handedness
          exists.
        </p>

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">
          3. Position Fit Score (Max 34 pts)
        </h3>
        <p className="text-white/40 text-xs mb-3">
          Batters, wicket-keepers and all-rounders fill three groups of up to 3
          players. Each player counts in one group only, and the groups are
          filled together to give the highest total.
        </p>
        <Table
          headers={["Group", "Rating (0–10)", "Max points"]}
          rows={[
            ["Top order (#1–3)", "Top order rating", "14"],
            ["Middle order (#4–6)", "Middle order rating", "12"],
            ["Lower order (#7–9)", "Lower order rating", "8"],
          ]}
        />
        <div className="bg-surface-2/60 rounded-xl px-4 py-3 font-mono text-sm text-neon mt-3">
          player contribution = (rating / 10) × (group max / 3)
        </div>

        <div className="mt-3 space-y-1 text-xs text-white/40">
          <p>• Bowlers add no batting points.</p>
          <p>
            • A batter can fill only groups that include one of their preferred
            positions. With no preferred positions, any group is allowed.
          </p>
          <p>• An empty place in a group scores 0.</p>
        </div>
      </Section>

      {/* ── BOWLING SCORING ── */}
      <Section title="Bowling Score Breakdown">
        <h3 className="text-white font-semibold text-sm mb-2">
          1. Total Overs Score (Max 3 pts)
        </h3>
        <Table
          headers={["Overs", "Score"]}
          rows={[
            ["24+", "3.0"],
            ["23", "2.5"],
            ["22", "2.0"],
            ["21", "1.0"],
            ["20", "0.5"],
            ["< 20", "0"],
          ]}
        />

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">
          2. Pace Overs Score (Max 3 pts)
        </h3>
        <Table
          headers={["Pace Overs", "Score"]}
          rows={[
            ["14+", "2.5"],
            ["13", "2.0"],
            ["12", "1.5"],
            ["11", "1.0"],
            ["10", "0.5"],
            ["< 10", "0"],
          ]}
        />
        <p className="text-white/25 text-xs mt-1">
          +0.5 bonus if squad has both left-arm and right-arm pacers (cap 3.0
          total).
        </p>

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">
          3. Spin Overs Score (Max 3 pts)
        </h3>
        <Table
          headers={["Spin Overs", "Score"]}
          rows={[
            ["10+", "2.5"],
            ["9", "2.0"],
            ["8", "1.5"],
            ["7", "1.0"],
            ["6", "0.5"],
            ["< 6", "0"],
          ]}
        />
        <p className="text-white/25 text-xs mt-1">
          +0.5 bonus for complementary spin archetypes (off-spin + leg-spin
          combo).
        </p>

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">
          4. Phase Bowling Scores
        </h3>
        <p className="text-white/40 text-xs mb-3">
          Requires ≥ 2 eligible bowlers. Takes top 4 bowlers per phase.
        </p>
        <div className="bg-surface-2/60 rounded-xl px-4 py-3 font-mono text-sm text-neon mb-3">
          Phase Score = avg(top 4 ratings) × multiplier [clamped to max]
        </div>
        <Table
          headers={["Phase", "Multiplier", "Max Points"]}
          rows={[
            ["Powerplay", "1.0×", "10"],
            ["Middle", "1.1×", "11"],
            ["Death", "1.0×", "10"],
          ]}
        />
      </Section>

      {/* ── SUPPLEMENTARY SCORES ── */}
      <Section title="Supplementary Score Formulas">
        <div className="space-y-4">
          {[
            {
              label: "Fitness (Max 5)",
              formula: "avg(stamina,  10 − injury_risk)  ×  0.5",
              attrs: "fitness.stamina, fitness.injury_risk",
            },
            {
              label: "Impact (Max 7)",
              formula: "avg(match_winner,  clutch,  consistency)  ×  0.7",
              attrs: "role_impact.match_winner / clutch / consistency",
            },
            {
              label: "Tactical (Max 3)",
              formula: "avg(flexibility of all players)  ×  0.3",
              attrs: "tactical.flexibility",
            },
            {
              label: "Age (Max 1)",
              formula: "clamp(1 − |avg_age − 30| / 15,  0,  1)",
              attrs: "Player age — optimal team average = 30 years",
            },
          ].map(({ label, formula, attrs }) => (
            <div key={label} className="bg-surface-2/40 rounded-xl p-4">
              <p className="text-white text-sm font-semibold mb-1">{label}</p>
              <pre className="font-mono text-xs text-neon whitespace-pre-wrap mb-1">
                {formula}
              </pre>
              <p className="text-white/30 text-xs">Source fields: {attrs}</p>
            </div>
          ))}

          {/* Captaincy — full step table */}
          <div className="bg-surface-2/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.08]">
              <p className="text-white text-sm font-semibold">
                Captaincy (Max 4)
              </p>
              <p className="text-white/25 text-xs mt-0.5">
                Source: <span className="font-mono">tactical.captaincy</span>{" "}
                summed across all squad players
              </p>
            </div>
            <div className="px-4 py-3 border-b border-white/[0.08]">
              <pre className="font-mono text-xs text-neon whitespace-pre-wrap">
                {
                  "steps = floor(max(0,  1.75 − total)  /  0.25)\nscore = max(0,  4  −  steps × 0.5)"
                }
              </pre>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-white/30 font-semibold py-1.5 px-4 text-xs uppercase tracking-wider">
                    Total captaincy (squad sum)
                  </th>
                  <th className="text-right text-white/30 font-semibold py-1.5 px-4 text-xs uppercase tracking-wider">
                    Steps
                  </th>
                  <th className="text-right text-white/30 font-semibold py-1.5 px-4 text-xs uppercase tracking-wider">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["> 1.50", "0", "4.0"],
                  ["1.26 – 1.50", "1", "3.5"],
                  ["1.01 – 1.25", "2", "3.0"],
                  ["0.76 – 1.00", "3", "2.5"],
                  ["0.51 – 0.75", "4", "2.0"],
                  ["0.26 – 0.50", "5", "1.5"],
                  ["0.01 – 0.25", "6", "1.0"],
                  ["≤ 0", "—", "0.0"],
                ].map(([range, steps, score], i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="py-1.5 px-4 text-white/60 font-mono">
                      {range}
                    </td>
                    <td className="py-1.5 px-4 text-white/30 text-right font-mono">
                      {steps}
                    </td>
                    <td
                      className={`py-1.5 px-4 text-right font-mono font-semibold ${score === "4.0" ? "text-neon" : score === "0.0" ? "text-white/20" : "text-white/60"}`}
                    >
                      {score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── SQUAD RATING MODE ── */}
      <Section title="Squad Rating Mode">
        <p className="text-white/60 text-sm mb-4">
          When you click <strong className="text-neon">🛡️ Rate by Squad</strong>, the scoring formula changes to
          reward bench depth over tactical flexibility. The Playing 12 is still selected optimally, but the{" "}
          <em>Other</em> metrics are re-weighted and a Bench Strength score is added.
        </p>

        <h3 className="text-white font-semibold text-sm mb-2">Differences from Playing 12 mode</h3>
        <Table
          headers={["Component", "Playing 12 mode", "Squad mode"]}
          rows={[
            ["Fitness (max)", "5 pts  (×0.5)", "2 pts  (×0.2)"],
            ["Impact (max)", "7 pts  (×0.7)", "3 pts  (×0.3)"],
            ["Tactical", "3 pts  (×0.3)", "Removed (0)"],
            ["Bench Strength", "Not scored", "10 pts"],
            ["Batting + Bowling", "40 + 40", "40 + 40  (unchanged)"],
            ["Age + Captaincy", "1 + 4", "1 + 4  (unchanged)"],
          ]}
        />

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">Bench Strength (Max 10 pts)</h3>
        <div className="bg-surface-2/60 rounded-xl px-4 py-3 font-mono text-sm text-neon mb-3">
          Score = (backed_up / at_risk) × 10
        </div>
        <p className="text-white/40 text-xs mb-3">
          <em>at_risk</em> = players in the Playing 12 with injury_risk &gt; 4.{" "}
          If no at-risk players exist, full 10 pts are awarded automatically.{" "}
          If the Playing 12 is empty, score is 0.
        </p>

        <h3 className="text-white font-semibold text-sm mb-2">Backup Validity Rules</h3>
        <p className="text-white/40 text-xs mb-3">
          A bench player is a valid backup for an at-risk Playing 12 player if:
        </p>
        <Table
          headers={["At-risk role", "Condition", "Valid backup on bench"]}
          rows={[
            ["Wicket-Keeper", "Only 1 keeper in XI", "Wicket-Keeper only — keeping role is fully uncovered"],
            ["Wicket-Keeper", "2+ keepers in XI", "Wicket-Keeper or Batsman — keeping is covered by the second keeper; only the batting slot needs replacement"],
            ["Batsman", "—", "Batsman or Wicket-Keeper"],
            ["Bowler (pace)", "—", "Pace Bowler only"],
            ["Bowler (spin)", "—", "Spin Bowler only"],
            ["All-Rounder (fast)", "—", "Fast All-Rounder only (pure Bowlers cannot back up ARs)"],
            ["All-Rounder (spin)", "—", "Spin All-Rounder only (pure Bowlers cannot back up ARs)"],
          ]}
        />
        <p className="text-white/25 text-xs mt-3">
          Nationality constraint: an Indian at-risk player must be backed by an Indian bench player;
          overseas players can be backed by any nationality.
        </p>
      </Section>

      {/* ── GAME CONSTANTS ── */}
      <Section title="Game Constants">
        <Table
          headers={["Constant", "Value"]}
          rows={[
            ["Teams", "10 (MI, CSK, RCB, KKR, RR, DC, SRH, PBKS, GT, LSG)"],
            ["Starting purse per team", "120 Crores"],
            ["Max squad size", "25 players"],
            ["Playing-12 overseas cap", "4 players"],
            ["Min bid increment", "0.2 Crores"],
            ["Default auction timer", "10 seconds"],
            ["Bid normalization", "2 decimal places"],
            [
              "Optimal captain score threshold",
              "≥ 1.75 total captaincy for full 4 pts",
            ],
            ["Optimal team average age", "30 years"],
          ]}
        />
      </Section>
    </div>
  );
}

function InRoomLayout() {
  const { room, teamAssignments } = useRoom();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Lobby");

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const myAssignment = user ? teamAssignments?.[user.id] : null;

  return (
    <div className="h-full bg-obsidian overflow-hidden">
      <div className="fixed top-0 inset-x-0 z-40 h-[52px] bg-obsidian/95 border-b border-white/[0.06] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto h-full px-2 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`hidden md:block relative flex-shrink-0 px-4 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
                activeTab === tab
                  ? "text-neon border-neon"
                  : "text-white/30 border-transparent hover:text-white hover:border-white/20"
              }`}
            >
              {tab}
              {tab === "Auction" && room && (
                <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-neon animate-live-blink" />
              )}
            </button>
          ))}

          <div className="flex-shrink-0 ml-2 flex items-center gap-2 md:pb-1">
            <span className="text-[10px] text-white/25 uppercase tracking-wider">Room:</span>
            <span className="font-mono font-black text-neon text-sm bg-neon/[0.07] px-2 py-0.5 rounded-lg border border-neon/25 neon-glow">
              {room?.code}
            </span>
          </div>

          <div className="flex-shrink-0 ml-auto pl-2 flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => { logout(); navigate('/login'); }}
              className="text-[11px] font-medium text-white/35 hover:text-white/70
                         border border-white/[0.07] hover:border-white/[0.12]
                         px-2.5 py-1.5 rounded-lg transition-all duration-150
                         hover:bg-white/[0.03] whitespace-nowrap">
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* All tabs are always mounted — hidden via CSS to preserve state across tab switches */}
      <div className="h-full pt-[52px] pb-tabbar overflow-hidden">
        <div className={`h-full overflow-y-auto ${activeTab === "Lobby" ? "" : "hidden"}`}>
          <div className="max-w-2xl mx-auto px-3 py-3 md:px-4 md:py-8">
            <RoomLobby />
          </div>
        </div>

        <div className={`h-full ${activeTab === "Auction" ? "" : "hidden"}`}>
          {myAssignment ? (
            <div className="h-full overflow-y-auto lg:overflow-hidden">
              <AuctionBoard />
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="border border-white/[0.08] bg-surface rounded-2xl p-10 text-center max-w-sm shadow-2xl">
                  <div className="w-14 h-14 rounded-full border border-neon/25 bg-neon/[0.08] flex items-center justify-center mx-auto mb-5 text-2xl">🏏</div>
                  <h2 className="text-white font-black text-xl mb-2">Pick a Team First</h2>
                  <p className="text-white/40 text-sm mb-6">
                    Go to the Lobby tab and select your team before joining the auction.
                  </p>
                  <button
                    onClick={() => setActiveTab("Lobby")}
                    className="bg-neon text-black font-bold px-6 py-2.5 rounded-xl hover:brightness-110 transition"
                  >
                    Go to Lobby
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`h-full overflow-y-auto ${activeTab === "Teams" ? "" : "hidden"}`}>
          <TeamsTab />
        </div>

        <div className={`h-full overflow-y-auto ${activeTab === "Players" ? "" : "hidden"}`}>
          <PlayersTab />
        </div>

        <div className={`h-full overflow-y-auto ${activeTab === "Rankings" ? "" : "hidden"}`}>
          <RankingPage />
        </div>

        <div className={`h-full overflow-y-auto ${activeTab === "Rules" ? "" : "hidden"}`}>
          <RulesTab />
        </div>

        <div className={`h-full overflow-y-auto ${activeTab === "Settings" ? "" : "hidden"}`}>
          <SettingsTab />
        </div>
      </div>

      {/* Phone tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 safe-bottom bg-surface border-t border-white/[0.08]">
        <div className="grid grid-cols-7 h-[58px]">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? "page" : undefined}
              className={`relative min-w-0 flex flex-col items-center justify-center gap-1 ${
                activeTab === tab ? "text-neon" : "text-white/40"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d={TAB_ICONS[tab]} />
              </svg>
              <span className="text-[10px] font-semibold leading-none">{tab}</span>
              {tab === "Auction" && room && (
                <span className="absolute top-1.5 right-1/4 w-1.5 h-1.5 rounded-full bg-neon animate-live-blink" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function RoomPage() {
  const { status, error } = useRoom();
  const { logout } = useAuth();
  const navigate = useNavigate();

  if (status === "in-room") return <InRoomLayout />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-end gap-2 px-4 pt-4">
        <ThemeToggle />
        <button onClick={() => { logout(); navigate('/login'); }}
          className="text-[12px] font-medium text-white/35 hover:text-white/70
                     border border-white/[0.07] hover:border-white/[0.12]
                     px-3 py-1.5 rounded-lg transition-all duration-150
                     hover:bg-white/[0.03]">
          Sign out
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <p className="text-[10px] font-black uppercase tracking-[3px] text-white/25 mb-2">Lobby</p>
          <h1 className="font-bebas text-5xl tracking-wider text-white">Auction Rooms</h1>
          <p className="text-white/40 mt-2 text-sm">Create a private room or join one with a code</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-bid-red/10 border border-bid-red/25 text-bid-red text-sm px-4 py-3 rounded-xl mb-6">
            <span>⚠</span> {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <CreateRoomForm />
          <JoinRoomForm />
        </div>
      </div>
    </div>
  );
}
