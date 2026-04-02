# IPL Auction Simulator

Full-stack real-time IPL Auction Simulator.

## Stack
- **Frontend**: React + Tailwind CSS
- **Backend**: Node.js + Express
- **Realtime**: Socket.IO
- **Database**: MongoDB + Mongoose

## Quick Start

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in your MONGO_URI and JWT_SECRET
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Roles
- **Auctioneer**: Controls auction flow (start, next player, sold/unsold)
- **Team Owner**: Places bids in real-time during live auction

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login |
| GET | /api/players | List players (filterable) |
| POST | /api/players | Add player (auctioneer) |
| GET | /api/teams | List teams |
| GET | /api/auction/session | Get auction state |
| POST | /api/auction/start | Start auction |
| POST | /api/auction/next-player | Move to next player |
| POST | /api/auction/sold | Mark current player sold |
| POST | /api/auction/unsold | Mark current player unsold |

## Socket Events
| Event | Direction | Payload |
|-------|-----------|---------|
| `bid:place` | Client → Server | `{ teamId, amount }` |
| `bid:update` | Server → All | `{ currentBid, highestBidder }` |
| `auction:nextPlayer` | Server → All | `{ player, currentBid }` |
| `auction:sold` | Server → All | `{ player, team, amount }` |
| `auction:unsold` | Server → All | `{ player }` |
| `auction:status` | Server → All | `{ status }` |
| `auction:completed` | Server → All | — |
