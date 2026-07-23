from pathlib import Path


STATIC_DIR = Path(__file__).parents[2] / "agent_app" / "static"


def test_frontend_has_no_runtime_dependency_or_render_blocking_script() -> None:
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")

    assert "https://" not in html
    assert "http://" not in html
    assert html.count("<script ") == 1
    assert '<script src="/static/app.js?v=8" defer></script>' in html
    assert '<link rel="stylesheet" href="/static/styles.css?v=8" />' in html
    assert html.count('rel="stylesheet"') == 1


def test_static_assets_stay_inside_lightweight_performance_budgets() -> None:
    budgets = {
        "index.html": 30_000,
        "styles.css": 40_000,
        "app.js": 100_000,
    }

    for filename, maximum_bytes in budgets.items():
        size = (STATIC_DIR / filename).stat().st_size
        assert size <= maximum_bytes, (
            f"{filename} usa {size} bytes; presupuesto {maximum_bytes}"
        )


def test_responsive_contract_covers_desktop_tablet_and_mobile() -> None:
    css = (STATIC_DIR / "styles.css").read_text(encoding="utf-8")

    desktop_layout = (
        ".layout { display: grid; grid-template-columns: minmax(0, 1.65fr) "
        "minmax(340px, .85fr);"
    )
    assert desktop_layout in css
    assert "@media (max-width: 900px)" in css
    tablet = css.split("@media (max-width: 900px)", 1)[1].split(
        "@media (max-width: 600px)", 1
    )[0]
    mobile = css.split("@media (max-width: 600px)", 1)[1]

    assert ".layout { grid-template-columns: minmax(0, 1fr); }" in tablet
    assert ".topic-grid { grid-template-columns: repeat(2" in tablet
    assert ".topic-grid { grid-template-columns: 1fr;" in mobile
    assert ".session-toolbar { grid-template-columns: 1fr 1fr 1fr; }" in mobile
    assert ".feedback-grid, .rubric-scores { grid-template-columns: 1fr; }" in mobile
