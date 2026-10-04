/**
 * Validation Utilities
 * Client-side input validation
 * Requirements: 11.6
 */
const Validation = (() => {
  function nim(value) {
    if (!value || !value.trim()) return 'NIM is required';
    if (value.trim().length < 3) return 'NIM must be at least 3 characters';
    if (value.trim().length > 20) return 'NIM is too long';
    return null; // valid
  }

  function password(value) {
    if (!value || !value.trim()) return 'Password is required';
    if (value.length < 4) return 'Password must be at least 4 characters';
    return null; // valid
  }

  function fileExtension(filename, allowedExtensions) {
    if (!filename) return 'No file selected';
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return `File type '${ext}' is not allowed. Allowed: ${allowedExtensions.join(', ')}`;
    }
    return null;
  }

  return { nim, password, fileExtension };
})();

window.Validation = Validation;
