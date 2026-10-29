import { describe, expect, it } from "vitest";
import { can, canAssignRole, canBan, canManageOwned, hasRole } from "@/lib/rbac";
import { safeRedirectPath, signUpSchema, usernameSchema } from "@/lib/validation/auth";

describe("RBAC", () => {
  it("návštevník smie sťahovať, ale nie nahrávať", () => {
    expect(can(null, "file:download")).toBe(true);
    expect(can(null, "catalog:browse")).toBe(true);
    expect(can(null, "mod:create")).toBe(false);
    expect(can("USER", "mod:create")).toBe(true);
  });

  it("hierarchia rolí", () => {
    expect(hasRole("ADMIN", "MODERATOR")).toBe(true);
    expect(hasRole("VERIFIED_CREATOR", "MODERATOR")).toBe(false);
    expect(can("USER", "mod:publish-without-review")).toBe(false);
    expect(can("VERIFIED_CREATOR", "mod:publish-without-review")).toBe(true);
    expect(can("MODERATOR", "category:manage")).toBe(false);
  });

  it("vlastníctvo: autor upraví svoj mod, cudzí používateľ nie, moderátor nie admina", () => {
    const author = { id: "a", role: "USER" as const };
    const other = { id: "b", role: "USER" as const };
    const moderator = { id: "m", role: "MODERATOR" as const };
    const admin = { id: "x", role: "ADMIN" as const };
    expect(canManageOwned(author, author, "mod:edit-own", "mod:edit-any")).toBe(true);
    expect(canManageOwned(other, author, "mod:edit-own", "mod:edit-any")).toBe(false);
    expect(canManageOwned(null, author, "mod:edit-own", "mod:edit-any")).toBe(false);
    expect(canManageOwned(moderator, author, "mod:edit-own", "mod:edit-any")).toBe(true);
    expect(canManageOwned(moderator, admin, "mod:edit-own", "mod:edit-any")).toBe(false);
  });

  it("zmena roly a ban len smerom nadol, nikdy sám sebe", () => {
    const admin = { id: "x", role: "ADMIN" as const };
    expect(canAssignRole(admin, "u", "USER", "MODERATOR")).toBe(true);
    expect(canAssignRole(admin, "u", "USER", "ADMIN")).toBe(false);
    expect(canAssignRole(admin, "x", "ADMIN", "USER")).toBe(false);
    expect(canAssignRole({ id: "m", role: "MODERATOR" }, "u", "USER", "VERIFIED_CREATOR")).toBe(false);
    expect(canBan({ id: "m", role: "MODERATOR" }, { id: "u", role: "USER" })).toBe(true);
    expect(canBan({ id: "m", role: "MODERATOR" }, { id: "n", role: "MODERATOR" })).toBe(false);
  });
});

describe("validácia registrácie", () => {
  const valid = {
    name: "Ľubomír Šťastný",
    username: "lubo.karosa",
    email: "Lubo@Example.SK",
    password: "Dispecing-2026",
    passwordConfirm: "Dispecing-2026",
    acceptTerms: "on",
  };

  it("prijme platné údaje a normalizuje email", () => {
    const parsed = signUpSchema.parse(valid);
    expect(parsed.email).toBe("lubo@example.sk");
    expect(parsed.name).toBe("Ľubomír Šťastný");
  });

  it("odmietne slabé heslo, nezhodu, heslo s menom a chýbajúci súhlas", () => {
    const codes = (input: Record<string, unknown>) =>
      signUpSchema.safeParse(input).error?.issues.map((i) => i.message) ?? [];
    expect(codes({ ...valid, password: "kratke", passwordConfirm: "kratke" })).toContain("PASSWORD_LENGTH");
    expect(codes({ ...valid, password: "lenpismenaaaa", passwordConfirm: "lenpismenaaaa" })).toContain("PASSWORD_WEAK");
    expect(codes({ ...valid, passwordConfirm: "Iné-heslo-123" })).toContain("PASSWORD_MISMATCH");
    expect(codes({ ...valid, password: "lubo.karosa-1", passwordConfirm: "lubo.karosa-1" })).toContain(
      "PASSWORD_CONTAINS_IDENTITY",
    );
    expect(codes({ ...valid, acceptTerms: undefined })).toContain("TERMS_REQUIRED");
  });

  it("používateľské mená: formát, rezervované, bidi znaky v mene", () => {
    expect(usernameSchema.safeParse("Ab").success).toBe(false);
    expect(usernameSchema.safeParse("štefan").success).toBe(false);
    expect(usernameSchema.safeParse("-zaciatok").success).toBe(false);
    expect(usernameSchema.safeParse("dva..body").success).toBe(false);
    expect(usernameSchema.safeParse("admin").error?.issues[0]?.message).toBe("USERNAME_RESERVED");
    expect(usernameSchema.parse("SOR_BN12")).toBe("sor_bn12");
    expect(signUpSchema.safeParse({ ...valid, name: "Admin‮nimda" }).success).toBe(false);
  });
});

describe("ochrana proti open redirect", () => {
  it.each([
    ["/mody?q=karosa", "/mody?q=karosa"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/api/auth/sign-out", "/"],
    ["javascript:alert(1)", "/"],
    [undefined, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
