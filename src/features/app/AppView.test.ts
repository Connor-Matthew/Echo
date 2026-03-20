import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import {
  CENTERED_LANDING_BODY_TEXT,
  CENTERED_LANDING_EYEBROW_TEXT,
  CENTERED_LANDING_HEADING_TEXT,
  getCenteredLandingBodyClassName,
  getCenteredLandingComposerClassName,
  getCenteredLandingContentClassName,
  getCenteredLandingEyebrowClassName,
  getCenteredLandingHeadingClassName,
  getChatHomeNavLinksClassName,
  getChatHomeSearchClassName,
  getChatHomeTopNavClassName,
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
      "chat-reading-stage mx-auto w-full min-w-0 max-w-[1040px]"
    );
  });

  it("uses the approved high-fidelity heading copy for the centered landing state", () => {
    assert.equal(CENTERED_LANDING_HEADING_TEXT, "Echo Silk");
  });

  it("adds a quieter atelier eyebrow above the hero heading", () => {
    assert.equal(CENTERED_LANDING_EYEBROW_TEXT, "The Atelier");
    assert.equal(
      getCenteredLandingEyebrowClassName(),
      "mb-3 text-center text-[12px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/70 sm:mb-4"
    );
  });

  it("gives the centered landing title a larger editorial shell", () => {
    assert.equal(
      getCenteredLandingHeadingClassName(),
      "landing-title-hero mb-4 text-center text-[46px] font-semibold leading-[0.98] tracking-[-0.05em] text-foreground sm:mb-5 sm:text-[58px] md:text-[66px]"
    );
  });

  it("uses warmer supporting copy and extra top whitespace for the landing hero", () => {
    assert.equal(
      CENTERED_LANDING_BODY_TEXT,
      "Describe a direction, drop in a reference, or keep shaping the conversation with Echo."
    );
    assert.equal(
      getCenteredLandingBodyClassName(),
      "mx-auto mt-0 max-w-[640px] text-center text-[15px] leading-7 text-muted-foreground/86 sm:text-[17px]"
    );
    assert.equal(
      getCenteredLandingContentClassName(),
      "flex min-h-0 flex-1 items-center justify-center px-2 py-10 sm:px-3 sm:py-12"
    );
  });

  it("uses a dedicated top navigation shell for the high-fidelity chat page", () => {
    assert.equal(
      getChatHomeTopNavClassName(),
      "chat-reading-stage mx-auto flex w-full items-center justify-between gap-6 px-2 pb-8 pt-5 sm:px-3"
    );
    assert.equal(
      getChatHomeNavLinksClassName(),
      "hidden items-center text-[15px] text-foreground/70 md:flex"
    );
    assert.equal(
      getChatHomeSearchClassName(),
      "flex h-11 w-[240px] items-center gap-3 rounded-full border border-border/55 bg-background/72 px-4 text-[14px] text-muted-foreground shadow-[0_10px_30px_rgba(83,65,44,0.06)] backdrop-blur"
    );
  });

  it("removes the top-left Echo Silk editorial brand copy from the chat nav", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { __ChatHomeTopNavForTest } = await import("./AppView");

    const markup = renderToStaticMarkup(
      createElement(__ChatHomeTopNavForTest, {
        onOpenSearch: () => {},
        onOpenProfile: () => {}
      })
    );

    assert.doesNotMatch(markup, /Echo Silk/);
    assert.doesNotMatch(markup, /Editorial Workspace/);
    assert.match(markup, />Chat</);
  });

});
