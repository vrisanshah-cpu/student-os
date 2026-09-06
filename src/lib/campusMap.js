// Static reference data for the campus map - a schematic of your building's
// levels and wings, room by room, so the "next class" highlight has
// somewhere real to point at. This ships with a generic example layout;
// replace LEVELS below with your own school's floor plan (level, wing
// names, and the room codes that show up in your class schedule) and the
// rest of the feature - lookup, highlighting, directions - just works.

export const LEVELS = [
  {
    level: 1,
    label: 'Level 1',
    wings: [
      {
        name: 'Wing A · Humanities',
        landmark: 'past the main staircase',
        rooms: ['A101', 'A102', 'A103', 'A104', 'A105', 'A Commons']
      },
      {
        name: 'Wing B · Administration',
        landmark: 'near the front office',
        rooms: ['Main Office', 'Principal', 'Auditorium', 'Student Lounge']
      }
    ]
  },
  {
    level: 2,
    label: 'Level 2',
    wings: [
      {
        name: 'Wing A · English',
        landmark: 'past the staircase, near the counseling office',
        rooms: ['B201', 'B202', 'B203', 'B204', 'Counseling Office']
      },
      {
        name: 'Wing B · Science',
        landmark: 'across the link bridge, by the library',
        rooms: ['C201', 'C202', 'C203', 'C204', 'Library']
      }
    ]
  },
  {
    level: 3,
    label: 'Level 3',
    wings: [
      {
        name: 'Wing A · Math',
        landmark: 'past the staircase',
        rooms: ['D301', 'D302', 'D303', 'D304', 'Math Team Room']
      },
      {
        name: 'Wing B · Arts & Technology',
        landmark: 'across the link bridge',
        rooms: ['E301', 'E302', 'Art Studio', 'Tech Lab']
      }
    ]
  },
  {
    level: 4,
    label: 'Level 4',
    wings: [
      {
        name: 'Wing A · World Languages',
        landmark: 'past the staircase',
        rooms: ['F401', 'F402', 'F403', 'Language Lab']
      },
      {
        name: 'Wing B · Electives',
        landmark: 'across the link bridge',
        rooms: ['G401', 'G402']
      }
    ]
  }
];

// Room code -> { level, wingIndex } for quick lookup. A room not found here
// (e.g. an outdoor/gym area not on the classroom-level floor plans) just
// falls back to text-only directions with no schematic highlight.
const ROOM_INDEX = new Map();
for (const lvl of LEVELS) {
  lvl.wings.forEach((wing, wingIndex) => {
    for (const room of wing.rooms) {
      ROOM_INDEX.set(room.toUpperCase(), { level: lvl.level, wingIndex, wingName: wing.name, landmark: wing.landmark });
    }
  });
}

const SPECIAL_ROOMS = {
  GYM: { directions: 'Take the ground-floor exit toward the athletics fields - not on the classroom-level maps.' }
};

/** Looks up where a room code is, matching loosely against the map data (handles "Rm A101" style prefixes). */
export function locateRoom(rawRoom) {
  if (!rawRoom) return null;
  const room = rawRoom.replace(/^Rm\s*/i, '').trim();
  const hit = ROOM_INDEX.get(room.toUpperCase());
  if (hit) {
    const wing = LEVELS.find((l) => l.level === hit.level).wings[hit.wingIndex];
    return {
      room,
      level: hit.level,
      wingName: hit.wingName,
      directions: `Level ${hit.level} → ${hit.wingName} → ${hit.landmark}`,
      roomsInWing: wing.rooms
    };
  }
  const special = SPECIAL_ROOMS[room.toUpperCase()];
  if (special) return { room, level: null, wingName: null, directions: special.directions, roomsInWing: [] };
  return { room, level: null, wingName: null, directions: `Room ${room} isn't on the mapped floors yet - add it to src/lib/campusMap.js.`, roomsInWing: [] };
}
