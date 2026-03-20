import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CENTERED_LANDING_BODY_TEXT,
  CENTERED_LANDING_EYEBROW_TEXT,
  CENTERED_LANDING_HEADING_TEXT,
  getCenteredLandingBodyClassName,
  getCenteredLandingComposerClassName,
  getCenteredLandingContentClassName,
  getCenteredLandingEyebrowClassName,
  getCenteredLandingHeadingClassName,
  getChatHeaderClassNameForFloatingToggle,
  getFloatingSidebarToggleContainerClassName
} from "./AppView";

describe("features/app/AppView", () => {
  it("keeps the floating sidebar toggle close to the mac traffic lights", () => {
    assert.equal(
      getFloatingSidebarToggleContainerClassName(true),
      "absolute left-[96px] top-2 z-20"
    );
    assert.equal(
      getFloatingSidebarToggleContainerClassName(false),
      "absolute left-3 top-3 z-20"
    );
  });

  it("keeps chat header text clear of the mac titlebar toggle", () => {
    assert.equal(
      getChatHeaderClassNameForFloatingToggle(true, true),
      "pl-[144px] sm:pl-[148px]"
    );
    assert.equal(
      getChatHeaderClassNameForFloatingToggle(true, false),
      "pl-[132px] sm:pl-[136px]"
    );
    assert.equal(getChatHeaderClassNameForFloatingToggle(false, true), undefined);
  });

  it("uses the shared reading stage width for the centered landing composer", () => {
    assert.equal(
      getCenteredLandingComposerClassName(),
      "chat-reading-stage mx-auto w-full min-w-0 max-w-[980px]"
    );
  });

  it("uses the approved English heading copy for the centered landing state", () => {
    assert.equal(CENTERED_LANDING_HEADING_TEXT, "Welcome back.");
  });

  it("adds a quiet atelier eyebrow above the welcome heading", () => {
    assert.equal(CENTERED_LANDING_EYEBROW_TEXT, "The Digital Atelier");
    assert.equal(
      getCenteredLandingEyebrowClassName(),
      "mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/72 sm:mb-5"
    );
  });

  it("adds a dedicated modern heading font hook for the centered landing title", () => {
    assert.equal(
      getCenteredLandingHeadingClassName(),
      "landing-title-hero mb-5 text-center text-[42px] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:mb-6 sm:text-[52px] md:text-[60px]"
    );
  });

  it("uses lighter supporting copy and extra top whitespace for the landing hero", () => {
    assert.equal(
      CENTERED_LANDING_BODY_TEXT,
      "Start with a clear question, a half-formed idea, or the next thing you want Echo to shape."
    );
    assert.equal(
      getCenteredLandingBodyClassName(),
      "mx-auto mt-0 max-w-[620px] text-center text-[15px] leading-7 text-muted-foreground/84 sm:text-[16px]"
    );
    assert.equal(
      getCenteredLandingContentClassName(),
      "flex min-h-0 flex-1 items-start justify-center pt-[9vh] sm:pt-[11vh] md:pt-[12vh]"
    );
  });
});
