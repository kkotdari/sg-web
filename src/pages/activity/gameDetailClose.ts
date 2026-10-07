import { createContext } from "react";

export const GameDetailCloseContext = createContext<(() => void) | null>(null);
