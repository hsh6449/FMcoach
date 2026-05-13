import type { RoleDefinition } from "../types/domain";

export const roleDefinitions: RoleDefinition[] = [
  {
    id: "sk-su",
    name: "Sweeper Keeper",
    family: "goalkeeper",
    positions: ["GK"],
    weights: {
      decisions: 1.2,
      composure: 1,
      passing: 0.8,
      firstTouch: 0.8,
      concentration: 1,
      anticipation: 0.8,
      acceleration: 0.5
    }
  },
  {
    id: "cb-de",
    name: "Central Defender",
    family: "defender",
    positions: ["D C", "DC", "CB"],
    weights: {
      heading: 1.1,
      marking: 1.1,
      tackling: 1.1,
      positioning: 1,
      concentration: 1,
      strength: 0.9,
      jumpingReach: 0.8,
      bravery: 0.8
    }
  },
  {
    id: "bpd-de",
    name: "Ball Playing Defender",
    family: "defender",
    positions: ["D C", "DC", "CB"],
    weights: {
      passing: 1.1,
      technique: 0.9,
      vision: 0.8,
      composure: 1,
      decisions: 1,
      marking: 0.8,
      tackling: 0.8,
      positioning: 0.8
    }
  },
  {
    id: "fb-su",
    name: "Full Back",
    family: "wide",
    positions: ["D L", "D R", "DL", "DR", "WB L", "WB R"],
    weights: {
      tackling: 0.9,
      marking: 0.8,
      crossing: 0.8,
      positioning: 0.9,
      workRate: 1,
      stamina: 1,
      pace: 0.8,
      decisions: 0.7
    }
  },
  {
    id: "iwb-su",
    name: "Inverted Wing Back",
    family: "wide",
    positions: ["D L", "D R", "DL", "DR", "WB L", "WB R"],
    weights: {
      passing: 1,
      decisions: 1,
      positioning: 0.9,
      teamwork: 0.8,
      technique: 0.8,
      firstTouch: 0.8,
      tackling: 0.7,
      stamina: 0.7
    }
  },
  {
    id: "dm-de",
    name: "Defensive Midfielder",
    family: "midfielder",
    positions: ["DM", "M C", "MC"],
    weights: {
      tackling: 1,
      positioning: 1,
      concentration: 1,
      decisions: 0.9,
      teamwork: 0.9,
      workRate: 0.8,
      strength: 0.7,
      passing: 0.7
    }
  },
  {
    id: "bwm-su",
    name: "Ball Winning Midfielder",
    family: "midfielder",
    positions: ["DM", "M C", "MC"],
    weights: {
      tackling: 1.2,
      aggression: 1,
      bravery: 0.9,
      teamwork: 0.9,
      workRate: 1.1,
      stamina: 0.9,
      positioning: 0.8,
      strength: 0.7
    }
  },
  {
    id: "dlp-su",
    name: "Deep Lying Playmaker",
    family: "midfielder",
    positions: ["DM", "M C", "MC"],
    weights: {
      passing: 1.2,
      vision: 1.1,
      technique: 1,
      decisions: 1,
      firstTouch: 0.9,
      composure: 0.9,
      positioning: 0.7,
      teamwork: 0.7
    }
  },
  {
    id: "cm-su",
    name: "Central Midfielder",
    family: "midfielder",
    positions: ["M C", "MC", "DM"],
    weights: {
      passing: 1,
      decisions: 1,
      teamwork: 0.9,
      workRate: 0.9,
      firstTouch: 0.8,
      technique: 0.8,
      stamina: 0.8,
      positioning: 0.7
    }
  },
  {
    id: "ap-su",
    name: "Advanced Playmaker",
    family: "midfielder",
    positions: ["AM C", "AMC", "M C", "MC", "AM L", "AM R"],
    weights: {
      passing: 1.1,
      vision: 1.2,
      technique: 1,
      firstTouch: 1,
      decisions: 0.9,
      flair: 0.8,
      composure: 0.8,
      offTheBall: 0.7
    }
  },
  {
    id: "w-su",
    name: "Winger",
    family: "wide",
    positions: ["AM L", "AM R", "M L", "M R", "AML", "AMR", "ML", "MR"],
    weights: {
      crossing: 1.1,
      dribbling: 1.1,
      acceleration: 1,
      pace: 1,
      technique: 0.8,
      offTheBall: 0.7,
      workRate: 0.6,
      stamina: 0.6
    }
  },
  {
    id: "if-at",
    name: "Inside Forward",
    family: "attacker",
    positions: ["AM L", "AM R", "AML", "AMR"],
    weights: {
      dribbling: 1,
      finishing: 1.1,
      firstTouch: 0.9,
      technique: 0.9,
      offTheBall: 1,
      acceleration: 0.9,
      pace: 0.8,
      composure: 0.8
    }
  },
  {
    id: "af-at",
    name: "Advanced Forward",
    family: "attacker",
    positions: ["ST", "S C", "SC"],
    weights: {
      finishing: 1.2,
      offTheBall: 1.1,
      composure: 1,
      anticipation: 0.9,
      acceleration: 0.9,
      pace: 0.8,
      firstTouch: 0.8,
      decisions: 0.7
    }
  },
  {
    id: "pf-su",
    name: "Pressing Forward",
    family: "attacker",
    positions: ["ST", "S C", "SC"],
    weights: {
      workRate: 1.1,
      teamwork: 1,
      aggression: 0.9,
      stamina: 0.9,
      strength: 0.8,
      offTheBall: 0.8,
      finishing: 0.7,
      bravery: 0.7
    }
  },
  {
    id: "tm-su",
    name: "Target Forward",
    family: "attacker",
    positions: ["ST", "S C", "SC"],
    weights: {
      heading: 1.1,
      jumpingReach: 1.1,
      strength: 1.1,
      bravery: 0.8,
      teamwork: 0.7,
      firstTouch: 0.8,
      finishing: 0.7,
      offTheBall: 0.7
    }
  }
];
