/**
 * Business Timezone Utility
 * 
 * Centralizes all timezone-aware date operations.
 * The configured BUSINESS_TIMEZONE is authoritative for all date calculations.
 */

import { logger } from './logger';

// Default to East Africa Time (UTC+3) if not configured
const DEFAULT_TIMEZONE = 'Africa/Addis_Ababa';

/**
 * Get the configured business timezone
 */
export function getBusinessTimezone(): string {
  return process.env.BUSINESS_TIMEZONE || DEFAULT_TIMEZONE;
}

/**
 * Get current time in business timezone
 */
export function nowInBusinessTime(): Date {
  const tz = getBusinessTimezone();
  const now = new Date();
  // Get the current time in the business timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  
  const formatted = new Intl.DateTimeFormat('en-CA', options).format(now); // ISO-like format
  // Parse back to Date object
  const [datePart, timePart] = formatted.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  
  const result = new Date(year, month - 1, day, hour, minute, second);
  // Adjust for the timezone offset
  const utcTime = result.getTime() + (result.getTimezoneOffset() * 60000);
  const tzOffset = getTimezoneOffset(tz);
  return new Date(utcTime + tzOffset);
}

/**
 * Get timezone offset in milliseconds for a given timezone
 */
function getTimezoneOffset(tz: string): number {
  const now = new Date();
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  return tzDate.getTime() - utcDate.getTime();
}

/**
 * Get the start of the business day in business timezone
 * Returns a Date object representing midnight in the business timezone
 */
export function getBusinessDayStart(date: Date = new Date()): Date {
  const tz = getBusinessTimezone();
  const dateStr = formatDateInTz(date, tz);
  return parseISOInTimezone(dateStr, tz);
}

/**
 * Get the end of the business day in business timezone
 * Returns a Date object representing 23:59:59.999 in the business timezone
 */
export function getBusinessDayEnd(date: Date = new Date()): Date {
  const start = getBusinessDayStart(date);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Format a date in business timezone
 */
export function formatDateInTz(date: Date, tz: string = getBusinessTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Format a date with time in business timezone
 */
export function formatDateTimeInTz(date: Date, tz: string = getBusinessTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Parse an ISO date string into the specified timezone
 * Returns the date in local time that corresponds to the given UTC time
 */
export function parseISOInTimezone(isoString: string, tz: string = getBusinessTimezone()): Date {
  const utcDate = new Date(isoString);
  const offset = getTimezoneOffset(tz);
  return new Date(utcDate.getTime() + offset);
}

/**
 * Get the business date string (YYYY-MM-DD) for a given date in business timezone
 */
export function getBusinessDateString(date: Date = new Date()): string {
  return formatDateInTz(date, getBusinessTimezone());
}

/**
 * Parse a business date string (YYYY-MM-DD) to Date object
 */
export function parseBusinessDate(dateStr: string): Date {
  const tz = getBusinessTimezone();
  // Assume the date is in the business timezone at midnight
  return parseISOInTimezone(`${dateStr}T00:00:00.000Z`, tz);
}

/**
 * Check if a date is today in business timezone
 */
export function isToday(date: Date): boolean {
  return getBusinessDateString(date) === getBusinessDateString(new Date());
}

/**
 * Get the previous business day
 */
export function getPreviousBusinessDay(date: Date = new Date()): Date {
  const start = getBusinessDayStart(date);
  start.setDate(start.getDate() - 1);
  return start;
}

/**
 * Get the next business day
 */
export function getNextBusinessDay(date: Date = new Date()): Date {
  const start = getBusinessDayStart(date);
  start.setDate(start.getDate() + 1);
  return start;
}

/**
 * Get date range for a specific month in business timezone
 */
export function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const tz = getBusinessTimezone();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  
  return {
    start: parseISOInTimezone(start.toISOString(), tz),
    end: parseISOInTimezone(end.toISOString(), tz),
  };
}

/**
 * Validate that a timezone string is valid
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize and validate business timezone on startup
 */
export function initBusinessTimezone(): void {
  const tz = getBusinessTimezone();
  
  if (!isValidTimezone(tz)) {
    logger.warn({ tz }, `Invalid BUSINESS_TIMEZONE, using default: ${DEFAULT_TIMEZONE}`);
    return;
  }
  
  logger.info({ tz }, 'Business timezone configured');
}