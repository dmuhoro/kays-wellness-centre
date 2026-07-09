import { describe, it, expect } from "vitest";
import { generateSlots } from "@/lib/api/scheduling.server";

const defaultAvailability = [
  { day_of_week: 1, start_time: "09:00", end_time: "17:00", slot_duration_minutes: 60 },
  { day_of_week: 2, start_time: "09:00", end_time: "17:00", slot_duration_minutes: 60 },
  { day_of_week: 3, start_time: "09:00", end_time: "17:00", slot_duration_minutes: 30 },
  { day_of_week: 4, start_time: "09:00", end_time: "17:00", slot_duration_minutes: 60 },
  { day_of_week: 5, start_time: "09:00", end_time: "17:00", slot_duration_minutes: 60 },
  { day_of_week: 6, start_time: "10:00", end_time: "14:00", slot_duration_minutes: 60 },
];

describe("generateSlots", () => {
  it("returns empty array when no availability matches the day", () => {
    const sunday = new Date("2026-07-12T00:00:00Z");
    expect(generateSlots(sunday, defaultAvailability, [])).toEqual([]);
  });

  it("returns slots for a Monday (day 1)", () => {
    const monday = new Date("2026-07-13T00:00:00Z");
    const slots = generateSlots(monday, defaultAvailability, []);
    expect(slots.length).toBe(8);
    expect(slots[0]).toBe("2026-07-13T09:00:00.000Z");
    expect(slots[slots.length - 1]).toBe("2026-07-13T16:00:00.000Z");
  });

  it("returns 30-min slots on Wednesday", () => {
    const wednesday = new Date("2026-07-15T00:00:00Z");
    const slots = generateSlots(wednesday, defaultAvailability, []);
    expect(slots.length).toBe(16);
    expect(slots[0]).toBe("2026-07-15T09:00:00.000Z");
    expect(slots[1]).toBe("2026-07-15T09:30:00.000Z");
  });

  it("excludes booked timestamps", () => {
    const tuesday = new Date("2026-07-14T00:00:00Z");
    const booked = ["2026-07-14T10:00:00.000Z", "2026-07-14T14:00:00.000Z"];
    const slots = generateSlots(tuesday, defaultAvailability, booked);
    expect(slots).not.toContain("2026-07-14T10:00:00.000Z");
    expect(slots).not.toContain("2026-07-14T14:00:00.000Z");
    expect(slots).toContain("2026-07-14T09:00:00.000Z");
    expect(slots).toContain("2026-07-14T11:00:00.000Z");
    expect(slots.length).toBe(6);
  });

  it("last slot ends exactly at close time (no boundary overflow)", () => {
    const monday = new Date("2026-07-13T00:00:00Z");
    const slots = generateSlots(monday, defaultAvailability, []);
    const lastSlotStart = new Date(slots[slots.length - 1]);
    const slotEnd = new Date(lastSlotStart.getTime() + 60 * 60 * 1000);
    expect(slotEnd.toISOString()).toBe("2026-07-13T17:00:00.000Z");
  });

  it("handles empty availability", () => {
    const date = new Date("2026-07-13T00:00:00Z");
    expect(generateSlots(date, [], [])).toEqual([]);
  });

  it("handles Saturday with shorter hours", () => {
    const saturday = new Date("2026-07-18T00:00:00Z");
    const slots = generateSlots(saturday, defaultAvailability, []);
    expect(slots.length).toBe(4);
    expect(slots[0]).toBe("2026-07-18T10:00:00.000Z");
    expect(slots[slots.length - 1]).toBe("2026-07-18T13:00:00.000Z");
  });

  it("treats date UTC day correctly regardless of local timezone", () => {
    const mondayEveningLocal = new Date("2026-07-13T23:00:00+03:00");
    const slots = generateSlots(mondayEveningLocal, defaultAvailability, []);
    expect(slots.length).toBe(8);
    expect(slots[0]).toBe("2026-07-13T09:00:00.000Z");
  });

  it("returns [] for Sunday even when other days have availability", () => {
    const sunday = new Date("2026-07-19T00:00:00Z");
    expect(generateSlots(sunday, defaultAvailability, [])).toEqual([]);
  });
});
