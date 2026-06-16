export const validateDateFormat = (value: string): boolean => {
  if (!value) {
    console.log('Validation failed: date is empty');
    return false;
  }

  if (typeof value !== 'string') {
    console.log('Validation failed: date is not a string');
    return false;
  }

  /**
   * yyyy-mm-dd or yyyy-mm-dd hh:mm or yyyy-mm-dd hh:mm:ss
   *
   * Valid:
   * 2026-01-02
   * 2026-01-02 09:00
   * 2026-01-02 09:00:00
   *
   * Invalid:
   * 02-01-2026
   * 2026-1-2
   * 2026-01-02 9:0
   * 2026-01-02 09:00:00.000
   * 2026/01/02
   * 2026-01-02T09:00:00.000+07:00[Asia/Jakarta]
   */
  const regex = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;
  if (!regex.test(value)) {
    console.log('Validation failed: invalid date format');
    return false;
  }

  // Validate actual calendar date
  const [datePart, timePart] = value.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    console.log('Validation failed: invalid calendar date');
    return false;
  }

  // Validate time if present
  if (timePart) {
    const [hour, minute] = timePart.split(':').map(Number);

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      console.log('Validation failed: invalid time format');
      return false;
    }
  }

  return true;
};
