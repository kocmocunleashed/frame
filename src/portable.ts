// Frame's fixed offline player. This bundle contains no generated executable code.
type PortableModel = {
  width: number;
  height: number;
  portable: boolean;
  slides: {
    id: string;
    title: string;
    steps: Record<string, number>;
    animations?: Record<
      string,
      { type: string; step: number; delay?: number; duration?: number }
    >;
    autoplay: string[];
    interactions: {
      trigger: string;
      target: string;
      action: string;
      value: string;
      step?: number;
    }[];
  }[];
};
const model = JSON.parse(
  document.getElementById("frame-model")!.textContent!,
) as PortableModel;
const assets = JSON.parse(
  document.getElementById("frame-assets")!.textContent!,
) as Record<string, string>;
for (const element of document.querySelectorAll<HTMLElement>(
  "[data-frame-src]",
)) {
  const value = assets[element.dataset.frameSrc!];
  if (value) element.setAttribute("src", value);
}
for (const element of document.querySelectorAll<HTMLElement>(
  "[data-frame-poster]",
)) {
  const value = assets[element.dataset.framePoster!];
  if (value) element.setAttribute("poster", value);
}
if (model.portable) {
  let index = 0,
    step = 0;
  const revealed = new Set<string>();
  let lastGroup = "";
  const animations = new Map<string, Animation>();
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    (event) => {
      if (!event.matches) return;
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    },
  );
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-export-slide]"),
  );
  const count = document.getElementById("frame-counter")!,
    progress = document.getElementById("frame-progress")!,
    overview = document.getElementById("frame-overview") as HTMLDialogElement;
  const maximum = () =>
    Math.max(0, ...Object.values(model.slides[index].steps));
  function show() {
    const group = `${index}:${step}`;
    const animateGroup = group !== lastGroup;
    if (animateGroup) {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
      lastGroup = group;
    }
    const current = model.slides[index],
      scale = Math.min(
        (innerWidth - 24) / model.width,
        (innerHeight -
          Math.max(
            110,
            (document.querySelector<HTMLElement>(".portable-nav")
              ?.offsetHeight || 0) + 52,
          )) /
          model.height,
      );
    sections.forEach((section, i) => {
      section.hidden = i !== index;
      section.style.transform = `translate(-50%,-50%) scale(${Math.max(0.02, scale)})`;
      const targets = new Set(
        model.slides[i].interactions
          .filter((a) => a.trigger === "click" && a.action === "show")
          .map((a) => a.value),
      );
      for (const element of section.querySelectorAll<HTMLElement>(
        "[data-element-id]",
      )) {
        const id = element.dataset.elementId!;
        if (
          model.slides[i].interactions.some(
            (a) => a.trigger === "click" && a.target === id,
          )
        ) {
          element.tabIndex = 0;
          element.setAttribute("role", "button");
          if (!element.getAttribute("aria-label"))
            element.setAttribute(
              "aria-label",
              element.textContent?.trim().slice(0, 200) ||
                "Activate slide interaction",
            );
          element.classList.add("interactive-slide-object");
        }
        element.style.visibility =
          (model.slides[i].steps[id] || 0) > step ||
          (targets.has(id) && !revealed.has(id))
            ? "hidden"
            : "";
        const a = model.slides[i].animations?.[id],
          node = element.querySelector<HTMLElement>(".motion-content");
        if (
          animateGroup &&
          i === index &&
          node &&
          a &&
          a.step === step &&
          a.type !== "none" &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          const transform =
            a.type === "rise"
              ? "translateY(24px)"
              : a.type === "slide"
                ? "translateX(-40px)"
                : a.type === "scale"
                  ? "scale(.8)"
                  : "none";
          animations.set(
            id,
            node.animate(
              [
                { opacity: 0, transform },
                { opacity: 1, transform: "none" },
              ],
              {
                duration: a.duration || 280,
                delay: a.delay || 0,
                fill: "backwards",
                easing: "cubic-bezier(.22,1,.36,1)",
              },
            ),
          );
        }
      }
      for (const video of section.querySelectorAll<HTMLVideoElement>("video")) {
        video.autoplay = false;
        if (i !== index) video.pause();
        else if (
          current.autoplay.includes(
            video.closest<HTMLElement>("[data-element-id]")!.dataset.elementId!,
          ) &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        )
          void video.play().catch(() => {});
      }
    });
    count.textContent = `${index + 1} / ${sections.length}${maximum() ? ` · step ${step + 1}/${maximum() + 1}` : ""}`;
    progress.style.width = `${((index + 1) / sections.length) * 100}%`;
    document.body.dataset.currentSlide = String(index);
    document.body.dataset.currentStep = String(step);
    document.body.dataset.ready = "true";
    (document.getElementById("frame-previous") as HTMLButtonElement).disabled =
      index === 0 && step === 0;
    (document.getElementById("frame-next") as HTMLButtonElement).disabled =
      index === sections.length - 1 && step === maximum();
  }
  function next() {
    if (step < maximum()) step++;
    else if (index < sections.length - 1) {
      index++;
      step = 0;
      revealed.clear();
    }
    show();
  }
  function previous() {
    if (step > 0) step--;
    else if (index > 0) {
      index--;
      step = 0;
      revealed.clear();
    }
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    lastGroup = `${index}:${step}`;
    show();
  }
  document.getElementById("frame-next")!.addEventListener("click", next);
  document
    .getElementById("frame-previous")!
    .addEventListener("click", previous);
  document.getElementById("frame-fullscreen")!.addEventListener("click", () => {
    void (
      document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen()
    ).catch(() => {});
  });
  for (const [i, slide] of model.slides.entries()) {
    const button = document.createElement("button");
    button.textContent = `${i + 1}. ${slide.title}`;
    button.addEventListener("click", () => {
      index = i;
      step = 0;
      revealed.clear();
      overview.close();
      show();
    });
    overview.append(button);
  }
  const close = document.createElement("button");
  close.textContent = "Close overview";
  close.addEventListener("click", () => overview.close());
  overview.append(close);
  document
    .getElementById("frame-open-overview")!
    .addEventListener("click", () => overview.showModal());
  document.addEventListener("keydown", (event) => {
    if (overview.open) return;
    const target = event.target as HTMLElement;
    const interactive = target.closest<HTMLElement>(
      "[data-element-id][role=button]",
    );
    if (interactive && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      interactive.click();
      return;
    }
    if (target.closest("input,textarea,select,[contenteditable=true]")) return;
    if (event.key === " " && target.closest("button,a")) return;
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      next();
    }
    if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      previous();
    }
    if (event.key === "Home") {
      index = 0;
      step = 0;
      revealed.clear();
      show();
    }
    if (event.key === "End") {
      index = sections.length - 1;
      step = 0;
      revealed.clear();
      show();
    }
    if (event.key.toLowerCase() === "g") overview.showModal();
  });
  document.addEventListener("click", (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-element-id]",
    );
    if (!element) return;
    for (const interaction of model.slides[index].interactions.filter(
      (a) => a.trigger === "click" && a.target === element.dataset.elementId,
    )) {
      if (interaction.action === "show") revealed.add(interaction.value);
      if (interaction.action === "navigate") {
        const target = model.slides.findIndex(
          (s) => s.id === interaction.value,
        );
        if (target >= 0) {
          index = target;
          step = 0;
          revealed.clear();
        }
      }
    }
    show();
  });
  addEventListener("resize", show);
  show();
}
document.body.dataset.frameInitialized = "true";
