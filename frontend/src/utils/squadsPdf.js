// Builds and downloads a PDF listing every team's squad in a room.
// The PDF libraries are loaded only when someone asks for a download.
import { formatCroreAmount, normalizeCroreAmount } from './currency';
import { isOverseasPlayer } from './playerDisplay';

const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];
const MARGIN = 40;
const HEAD = { fillColor: [31, 36, 48], textColor: 255, fontStyle: 'bold' };

// The built-in PDF fonts have no rupee sign, so amounts are written in "Cr".
const crore = (amount) => `${formatCroreAmount(normalizeCroreAmount(amount ?? 0))} Cr`;

const rank = (role) => {
  const index = ROLE_ORDER.indexOf(role);
  return index === -1 ? ROLE_ORDER.length : index;
};

const squadOf = (team) => [...(team.players ?? [])].sort((a, b) =>
  rank(a.role) - rank(b.role) || String(a.name).localeCompare(String(b.name)));

const spentBy = (team) => crore((team.purse ?? 0) - (team.remainingPurse ?? 0));

const hexToRgb = (hex) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return HEAD.fillColor;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

// teams: the room's teams with populated players. owners: { teamId: username }.
export const downloadSquadsPdf = async ({ teams, roomCode, owners = {} }) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  doc.setFont('helvetica', 'bold').setFontSize(20);
  doc.text('IPL Auction - Team Squads', MARGIN, 50);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(100);
  doc.text(`Room ${roomCode}  |  Downloaded ${new Date().toLocaleString()}`, MARGIN, 68);

  autoTable(doc, {
    startY: 85,
    margin: { left: MARGIN, right: MARGIN, bottom: 45 },
    head: [['Team', 'Owner', 'Players', 'Overseas', 'Spent', 'Remaining']],
    body: sorted.map((team) => [
      team.name,
      owners[String(team._id)] ?? '-',
      `${team.players?.length ?? 0} / ${team.maxPlayers ?? 25}`,
      (team.players ?? []).filter(isOverseasPlayer).length,
      spentBy(team),
      crore(team.remainingPurse),
    ]),
    headStyles: HEAD,
    styles: { fontSize: 9, cellPadding: 5 },
  });

  let y = doc.lastAutoTable.finalY + 30;
  sorted.forEach((team) => {
    const squad = squadOf(team);
    // Keep a team's heading together with at least the start of its table.
    if (y > height - 140) {
      doc.addPage();
      y = 50;
    }

    doc.setFillColor(...hexToRgb(team.color)).rect(MARGIN, y - 11, 4, 28, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20);
    doc.text(`${team.name} (${team.shortName})`, MARGIN + 12, y);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100);
    const owner = owners[String(team._id)];
    doc.text(
      [
        owner && `Owner: ${owner}`,
        `${squad.length} players`,
        `Spent ${spentBy(team)}`,
        `Remaining ${crore(team.remainingPurse)}`,
      ].filter(Boolean).join('  |  '),
      MARGIN + 12, y + 14,
    );

    autoTable(doc, {
      startY: y + 24,
      margin: { left: MARGIN, right: MARGIN, top: 40, bottom: 45 },
      head: [['#', 'Player', 'Role', 'Nationality', 'Price']],
      body: squad.length
        ? squad.map((player, index) => [
          index + 1,
          player.name,
          player.role,
          player.nationality + (isOverseasPlayer(player) ? ' (Overseas)' : ''),
          player.soldPrice != null ? crore(player.soldPrice) : '-',
        ])
        : [[{ content: 'No players bought', colSpan: 5, styles: { halign: 'center', textColor: 130 } }]],
      headStyles: HEAD,
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 26 }, 4: { halign: 'right', cellWidth: 70 } },
    });
    y = doc.lastAutoTable.finalY + 34;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8).setTextColor(140);
    doc.text(`Page ${page} of ${pages}`, width - MARGIN, height - 20, { align: 'right' });
  }

  doc.save(`ipl-squads-${roomCode}.pdf`);
};
