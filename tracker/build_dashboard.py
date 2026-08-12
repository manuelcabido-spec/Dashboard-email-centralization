#!/usr/bin/env python3
"""Genera tracker/dashboard.html inyectando el estado (tasks.json + meta.json)
en la plantilla tracker/template.html.

Uso:  python3 tracker/build_dashboard.py
No tiene dependencias externas (solo stdlib).
"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
PLACEHOLDER = "/*__DATA__*/null"

FORBIDDEN_HINTS = ("contraseña", "password", "passwd")


def main() -> int:
    tasks = json.loads((BASE / "state" / "tasks.json").read_text(encoding="utf-8"))
    meta = json.loads((BASE / "state" / "meta.json").read_text(encoding="utf-8"))
    template = (BASE / "template.html").read_text(encoding="utf-8")

    if PLACEHOLDER not in template:
        print("ERROR: la plantilla no contiene el marcador /*__DATA__*/null", file=sys.stderr)
        return 1

    # Salvaguarda: nunca publicar credenciales por accidente.
    blob = json.dumps(tasks, ensure_ascii=False).lower()
    for hint in FORBIDDEN_HINTS:
        if hint in blob:
            print(f"ERROR: tasks.json contiene la palabra '{hint}'. Revisa que no haya credenciales antes de publicar.", file=sys.stderr)
            return 1

    data = {"meta": meta, "tasks": tasks}
    payload = json.dumps(data, ensure_ascii=False)
    # Evitar cierre prematuro del <script> si algún texto contiene "</script>".
    payload = payload.replace("</", "<\\/")

    out = template.replace(PLACEHOLDER, payload)
    (BASE / "dashboard.html").write_text(out, encoding="utf-8")
    n_open = sum(1 for t in tasks if t.get("status") in ("pendiente", "en_gestion"))
    print(f"OK: dashboard.html generado · {len(tasks)} tareas ({n_open} abiertas) · {meta.get('generated_at')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
