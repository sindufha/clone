/**
 * Data Formatting Utilities
 * Dates, status badges, countdowns
 */
const Format = (() => {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /**
   * Format ISO date string to human-readable
   * e.g. "2026-04-16T23:59:00Z" → "Apr 16, 2026, 11:59 PM"
   */
  function date(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '—';
      const month = MONTHS[d.getMonth()];
      const day = d.getDate();
      const year = d.getFullYear();
      let hour = d.getHours();
      const min = String(d.getMinutes()).padStart(2, '0');
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      return `${month} ${day}, ${year}, ${hour}:${min} ${ampm}`;
    } catch { return '—'; }
  }

  /**
   * Get countdown string from ISO date
   * e.g. "3 days left", "Overdue by 5 days", "Due today"
   * If assignment is submitted, returns null (finished, not overdue)
   */
  function countdown(isoStr, isSubmitted = false) {
    if (!isoStr || isSubmitted) return null;
    try {
      const due = new Date(isoStr);
      const now = new Date();
      const diffMs = due - now;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));

      if (diffMs < 0) {
        if (diffDays < -30) return `Overdue by ${Math.abs(diffDays)} days`;
        if (Math.abs(diffDays) > 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`;
        return `Overdue by ${diffHours}h`;
      }
      if (diffDays === 0) return 'Due today';
      if (diffDays === 1) return '1 day left';
      if (diffDays <= 7) return `${diffDays} days left`;
      if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks left`;
      return `${Math.ceil(diffDays / 30)} months left`;
    } catch { return null; }
  }

  /**
   * Returns CSS class modifier for due date urgency
   */
  function countdownClass(isoStr, isSubmitted = false) {
    if (!isoStr || isSubmitted) return isSubmitted ? 'finished' : '';
    try {
      const due = new Date(isoStr);
      const now = new Date();
      const diffMs = due - now;
      if (diffMs < 0) return 'overdue';
      if (diffMs < 3 * 24 * 60 * 60 * 1000) return 'soon';
      return '';
    } catch { return ''; }
  }

  /**
   * Submission status label + CSS class
   */
  function submissionStatus(status) {
    const map = {
      'submitted':      { label: 'Submitted',      cls: 'badge-submitted',     icon: '✓' },
      'not-submitted':  { label: 'Not Submitted',  cls: 'badge-not-submitted', icon: '○' },
      'draft':          { label: 'Draft',           cls: 'badge-draft',         icon: '◑' },
      'overdue':        { label: 'Overdue',         cls: 'badge-overdue',       icon: '!' },
    };
    return map[status] || map['not-submitted'];
  }

  /**
   * Grading status label + CSS class
   */
  function gradingStatus(status) {
    const map = {
      'graded':     { label: 'Graded',      cls: 'badge-graded'    },
      'not-graded': { label: 'Not Graded',  cls: 'badge-not-graded' },
      'pending':    { label: 'Pending',     cls: 'badge-pending'   },
    };
    return map[status] || map['not-graded'];
  }

  /**
   * Return card CSS class for overall assignment status
   */
  function cardStatusClass(assignment) {
    if (assignment.submissionStatus === 'submitted') return 'status-submitted';
    if (assignment.submissionStatus === 'draft')     return 'status-draft';
    if (assignment.submissionStatus !== 'submitted' && (assignment.isOverdue || assignment.submissionStatus === 'overdue')) return 'status-overdue';
    return 'status-not-submitted';
  }

  /**
   * Abbreviate course name for avatar
   */
  function courseInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  return { date, countdown, countdownClass, submissionStatus, gradingStatus, cardStatusClass, courseInitials };
})();

window.Format = Format;
