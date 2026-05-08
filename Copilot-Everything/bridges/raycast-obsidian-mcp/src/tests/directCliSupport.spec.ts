import { describe, expect, it } from "vitest";
import { buildDirectCliEnv, parseDirectCliVaultList, resolveDirectCliIdentity } from "./live/directCliSupport";

describe("directCliSupport", () => {
  it("repairs root logname mismatches by deriving the user from HOME", () => {
    const identity = resolveDirectCliIdentity({
      HOME: "/Users/trevorrobey",
      LOGNAME: "root",
      PATH: "/usr/bin",
    });

    expect(identity.user).toBe("trevorrobey");
    expect(identity.logname).toBe("trevorrobey");
    expect(["home", "os_user"]).toContain(identity.source);
  });

  it("preserves explicit non-root identity values", () => {
    const env = buildDirectCliEnv({
      HOME: "/Users/trevorrobey",
      USER: "trevorrobey",
      LOGNAME: "trevorrobey",
      PATH: "/usr/bin",
    });

    expect(env.USER).toBe("trevorrobey");
    expect(env.LOGNAME).toBe("trevorrobey");
    expect(env.PATH.split(":")).toContain("/Applications/Obsidian.app/Contents/MacOS");
  });

  it("parses verbose vault listings", () => {
    expect(parseDirectCliVaultList("My Digital Garden\t/Volumes/ExtraCurricular/My Digital Garden\n")).toEqual([
      {
        name: "My Digital Garden",
        path: "/Volumes/ExtraCurricular/My Digital Garden",
      },
    ]);
  });

  it("parses non-verbose vault listings", () => {
    expect(parseDirectCliVaultList("My Digital Garden\nAnother Vault\n")).toEqual([
      {
        name: "My Digital Garden",
        path: undefined,
      },
      {
        name: "Another Vault",
        path: undefined,
      },
    ]);
  });
});
