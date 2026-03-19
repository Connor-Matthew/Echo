import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CENTERED_LANDING_HEADING_TEXT,
  getCenteredLandingComposerClassName,
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
      "chat-reading-stage mx-auto w-full min-w-0"
    );
  });

  it("uses the approved English heading copy for the centered landing state", () => {
    assert.equal(CENTERED_LANDING_HEADING_TEXT, "Welcome back.");
  });

  it("adds a dedicated modern heading font hook for the centered landing title", () => {
    assert.equal(
      getCenteredLandingHeadingClassName(),
      "landing-title-hero mb-10 text-center text-[36px] font-semibold leading-tight text-foreground sm:mb-12 sm:text-[44px] md:mb-14"
    );
  });
});
