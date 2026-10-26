

export interface TruthMix {
  bProd: number;
  bDef: number;
  uBasic: number;
  uAdv: number;
  uCaster: number;
  uGround: number;
  uAir: number;
  worker5: number;
  btGround?: number;
  btGroundWon?: number;
  btAir?: number;
  btAirWon?: number;
  btMagic?: number;
  btMagicWon?: number;
  upGw: number;
  upGa: number;
  upAw: number;
  upAa: number;
  upSh: number;
  ups: Record<string, number>;
  upCounts: Record<string, number>;
  buildings: Record<string, number>;
  units: Record<string, number>;
  skills: Record<string, number>;
  skillsWon?: Record<string, number>;
  buildingSecs: Record<string, number>;
  unitSecs: Record<string, number>;
  skillSecs: Record<string, number>;
  coreSeconds: number | null;
  coreCmd: number;
  coreBuild: number;
  coreUnit: number;
}
