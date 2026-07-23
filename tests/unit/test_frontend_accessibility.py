from html.parser import HTMLParser
from pathlib import Path


STATIC_DIR = Path(__file__).parents[2] / "agent_app" / "static"


class AccessibilityParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.main_count = 0
        self.controls_without_name: list[str] = []
        self.label_targets: set[str] = set()
        self._label_depth = 0
        self._button_stack: list[dict[str, str | bool]] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attributes = {key: value or "" for key, value in attrs}
        if element_id := attributes.get("id"):
            assert element_id not in self.ids, f"ID duplicado: {element_id}"
            self.ids.add(element_id)
        if tag == "main":
            self.main_count += 1
        if tag == "label":
            self._label_depth += 1
            if target := attributes.get("for"):
                self.label_targets.add(target)
        if tag in {"input", "select", "textarea"}:
            has_name = bool(
                self._label_depth
                or attributes.get("aria-label")
                or attributes.get("aria-labelledby")
            )
            control_id = attributes.get("id") or f"<{tag}>"
            if not has_name:
                self.controls_without_name.append(
                    control_id
                )
        if tag == "button":
            self._button_stack.append(
                {
                    "id": attributes.get("id") or "<button>",
                    "named": bool(
                        attributes.get("aria-label")
                        or attributes.get("aria-labelledby")
                        or attributes.get("title")
                    ),
                }
            )

    def handle_data(self, data: str) -> None:
        if self._button_stack and data.strip():
            self._button_stack[-1]["named"] = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "label":
            self._label_depth -= 1
        if tag == "button":
            button = self._button_stack.pop()
            if not button["named"]:
                self.controls_without_name.append(str(button["id"]))


def test_page_exposes_keyboard_and_screen_reader_landmarks() -> None:
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    parser = AccessibilityParser()
    parser.feed(html)
    controls_without_name = [
        control
        for control in parser.controls_without_name
        if control not in parser.label_targets
    ]

    assert parser.main_count == 1
    assert controls_without_name == []
    assert 'class="skip-link" href="#main-content"' in html
    assert 'id="main-content" tabindex="-1"' in html
    assert 'id="conversation-feed" class="conversation-feed" role="log"' in html
    assert 'id="announcements" class="sr-only" role="status"' in html
    assert 'id="error" class="error recovery-message hidden" role="alert"' in html
    assert 'id="retry-action"' in html
    assert 'id="progress-track" class="progress-track" role="progressbar"' in html
    assert 'id="health-summary" class="health-summary"' in html


def test_styles_cover_focus_contrast_motion_and_responsive_layouts() -> None:
    css = (STATIC_DIR / "styles.css").read_text(encoding="utf-8")

    assert ":focus-visible" in css
    assert "@media (prefers-contrast: more)" in css
    assert "@media (prefers-reduced-motion: reduce)" in css
    assert "@media (max-width: 900px)" in css
    assert "@media (max-width: 600px)" in css
    assert ".layout { grid-template-columns: minmax(0, 1fr); }" in css
    assert ".topic-grid { grid-template-columns: 1fr;" in css


def test_client_manages_focus_loading_retries_and_reconnection() -> None:
    script = (STATIC_DIR / "app.js").read_text(encoding="utf-8")

    assert 'event.key !== "Escape"' in script
    assert 'window.addEventListener("offline", updateConnectionStatus)' in script
    assert 'window.addEventListener("online", updateConnectionStatus)' in script
    assert 'setAttribute("aria-busy"' in script
    assert "restoreFocus()" in script
    assert "data-retry-topics" in script
    assert "data-retry-projects" in script
    assert 'fetch("/api/observability")' in script
    assert "Tokens estimados" in script
