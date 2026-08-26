// Shared between the Daily Routine settings editor and the unified Calendar
// view so a block's color means the same thing in both places. Loosely
// follows the color key from the student's own routine PDF (yellow=morning,
// teal=afternoon, pink=required study, blue=flex/project work,
// green=interest rotation, purple=evening wind-down, grey=school/sleep),
// picked from this app's existing palette for dark-theme contrast.
export const ROUTINE_CATEGORIES = [
  { value: 'morning', label: 'Morning routine', color: '#F2B84B' },
  { value: 'afternoon', label: 'Afternoon', color: '#2FBFAE' },
  { value: 'study', label: 'Required study', color: '#E56B6B' },
  { value: 'flex', label: 'Flex / project work', color: '#5B8CFF' },
  { value: 'interest', label: 'Interest rotation', color: '#4FD1A5' },
  { value: 'winddown', label: 'Evening wind-down', color: '#7C4DBE' },
  { value: 'sleep', label: 'Sleep', color: '#8890A6' }
];

export function routineCategoryColor(category) {
  return ROUTINE_CATEGORIES.find((c) => c.value === category)?.color || '#7C4DBE';
}

// The overall "this is the personal routine layer" identity color, used for
// the Calendar view's filter chip - distinct from the blues/greens/ambers
// used by Google Calendar, Classroom, and class-schedule layers.
export const ROUTINE_LAYER_COLOR = '#7C4DBE';

export const ROUTINE_DAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
];
