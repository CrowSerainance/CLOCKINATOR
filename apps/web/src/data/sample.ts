import type { DayGroup, ProjectRow } from "../types";

// Sample data mirroring the design mockup. Swap for the real API later.
export const dayGroups: DayGroup[] = [
  {
    label: "Today",
    total: "2:27:14",
    entries: [
      {
        desc: "Checkout flow hi-fi mockups",
        project: "Mobile App v2",
        color: "#57b6b0",
        client: "Lumen Health",
        tag: "Design",
        start: "09:15",
        end: "11:42",
        dur: "2:27:14",
        billable: true,
      },
    ],
  },
  {
    label: "Yesterday",
    total: "5:18:02",
    entries: [
      {
        desc: "Component audit & cleanup",
        project: "Design System",
        color: "#b58fd6",
        client: "Internal",
        tag: "Research",
        start: "14:30",
        end: "16:48",
        dur: "2:18:00",
        billable: false,
      },
      {
        desc: "Sprint planning + standup",
        project: "Mobile App v2",
        color: "#57b6b0",
        client: "Lumen Health",
        tag: "Meeting",
        start: "10:00",
        end: "12:00",
        dur: "2:00:02",
        billable: true,
      },
      {
        desc: "Bug triage",
        project: "QA & Bugfixes",
        color: "#e08585",
        client: "Acme Corp",
        start: "09:00",
        end: "10:00",
        dur: "1:00:00",
        billable: true,
      },
    ],
  },
  {
    label: "Wed, Jun 24",
    total: "3:45:00",
    entries: [
      {
        desc: "Marketing site hero section",
        project: "Marketing Site",
        color: "#e0b15c",
        client: "Riverside Co",
        tag: "Frontend",
        start: "13:15",
        end: "17:00",
        dur: "3:45:00",
        billable: true,
      },
    ],
  },
];

export const weekTotal = "26:42:16";

export const projects: ProjectRow[] = [
  { name: "Mobile App v2", color: "#57b6b0", client: "Lumen Health", tracked: "68.2h", progress: 0.57, budget: "68 / 120h", rate: "$160/h", status: "Active", statusColor: "#5bbd7e", access: "public", favorite: true },
  { name: "Brand Refresh", color: "#5bbd7e", client: "Acme Corp", tracked: "42.5h", progress: 0.71, budget: "42 / 60h", rate: "$145/h", status: "Active", statusColor: "#5bbd7e", access: "public", favorite: false },
  { name: "Marketing Site", color: "#e0b15c", client: "Riverside Co", tracked: "31.8h", progress: 0.8, budget: "32 / 40h", rate: "$130/h", status: "Active", statusColor: "#5bbd7e", access: "public", favorite: false },
  { name: "Design System", color: "#b58fd6", client: "Internal", tracked: "22.4h", progress: null, budget: "No budget", rate: "—", status: "Non-billable", statusColor: "#7d776e", access: "private", favorite: false },
  { name: "Research & Discovery", color: "#7aa6e0", client: "Lumen Health", tracked: "18.6h", progress: 0.78, budget: "19 / 24h", rate: "$120/h", status: "Active", statusColor: "#5bbd7e", access: "private", favorite: true },
  { name: "QA & Bugfixes", color: "#e08585", client: "Acme Corp", tracked: "14.2h", progress: 0.71, budget: "14 / 20h", rate: "$110/h", status: "On hold", statusColor: "#e0b15c", access: "public", favorite: false },
];
