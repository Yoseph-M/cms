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
  // Create a date at midnight in local time for the given date string
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
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
 * @param year - Full year (e.g., 2024)
 * @param month - Month number 1-12 (1=January, 12=December)
 */
export function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  // month parameter is 1-indexed, but Date constructor uses 0-indexed months
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  // Get last day of month: set to day 0 of next month
  const lastDay = new Date(year, month, 0).getDate();
  const end = new Date(year, month - 1, lastDay, 23, 59, 59, 999);
  
  return { start, end };
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
 * Get the current business date (server-authoritative)
 * Returns YYYY-MM-DD string in business timezone
 * 
 * This is the single source of truth for "what day is it?"
 * NEVER allow clients to calculate this - timezone manipulation risk!
 */
export function getCurrentBusinessDate(): string {
  return getBusinessDateString(new Date());
}

/**
 * Validate that a date string is not in the future
 * Prevents time-travel attacks
 */
export function validateNotFuture(dateStr: string): boolean {
  const current = getCurrentBusinessDate();
  return dateStr <= current; // String comparison works for YYYY-MM-DD
}

/**
 * Validate that a date string is not in the past beyond a threshold
 * Useful for preventing backdating
 */
export function validateNotTooOld(dateStr: string, maxDaysAgo: number = 30): boolean {
  const now = new Date();
  const target = parseBusinessDate(dateStr);
  const diffMs = now.getTime() - target.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays <= maxDaysAgo;
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