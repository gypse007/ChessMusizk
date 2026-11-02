export type LegendArchetype =
  | 'Chaos Strategist'
  | 'The Dominator'
  | 'The Precision Strategist'
  | 'The Precision Assassin'
  | 'The Rapid Striker'
  | 'The Defensive Master';

export interface LegendVisualIdentity {
  primary_color: string;
  secondary_color: string;
  aura: string;
  environment: string;
}

export interface LegendCharacterStats {
  tactics: number;
  calculation: number;
  positional: number;
  endgame: number;
  chaos: number;
}

export interface ChessLegend {
  id: string;
  name: string;
  title: string;
  archetype: LegendArchetype;
  signature_ability: string;
  dungeon: string;
  boss_enemy: string;
  tactical_weakness: string;
  signature_chess_mechanic: string;
  visual_identity: LegendVisualIdentity;
  sound_identity: string;
  character_stats: LegendCharacterStats;
}

export type ChessRPGEventType =
  | 'brilliant_sacrifice'
  | 'forced_checkmate'
  | 'queen_sacrifice'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered_attack'
  | 'promotion'
  | 'castling'
  | 'zugzwang'
  | 'check'
  | 'blunder'
  | 'comeback'
  | 'time_scramble'
  | 'stalemate';

export interface ChessRPGEventMapping {
  chess_event: ChessRPGEventType;
  rpg_interpretation: string;
  trigger_conditions: string;
  visual_treatment: string;
  audio_treatment: string;
  animation: string;
  narrative: string;
}

export interface TimelineBeat {
  start_sec: number;
  end_sec: number;
  beat: string;
}

export interface EpisodeTemplate {
  id: string;
  name: string;
  trigger: string;
  style: string;
  duration_sec: number;
  aspect_ratio?: string;
  fps?: number;
  timeline_beats: TimelineBeat[];
}

export interface EpisodeMoveSequence {
  ply: number;
  san: string;
  side: 'white' | 'black';
  fen: string;
  comment?: string;
  evalCp?: number;
  isSacrifice?: boolean;
}

export interface EpisodeData {
  episodeNumber: number;
  title: string;
  legend: ChessLegend;
  opponent: {
    name: string;
    bossTitle: string;
  };
  historicalGame: {
    event: string;
    year: number;
    eco: string;
    result: string;
  };
  moves: EpisodeMoveSequence[];
  templateId: string;
}
