declare module "uxp" {
  export const host: { name: string };
}

declare module "premierepro" {
  export function evalScript(code: string): Promise<string>;
}

declare module "aftereffects" {
  export function evalScript(code: string): Promise<string>;
}

declare function require(module: "uxp"): typeof import("uxp");
declare function require(module: "premierepro"): typeof import("premierepro");
declare function require(module: "aftereffects"): typeof import("aftereffects");
