"""Validate root template capacities and refresh the static web copies."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def sync_templates(root=ROOT):
    for variant in ("", "_cas"):
        capacities = []
        for mode in ("rb", "cb"):
            name = f"001.MCQ{variant}-{mode}.xml"
            source = root / name
            question = ET.fromstring(source.read_bytes()).find("question")
            variables = question.findtext("questionvariables/text", "")
            limits = {}
            for truth, suffix in (("C", "cp"), ("W", "wp")):
                match = re.search(rf"%__mcq_max_{suffix}\s*:\s*(\d+)\s*;", variables)
                if not match or int(match[1]) < 1:
                    raise ValueError(f"{name}: missing positive max_{suffix}")
                limits[truth] = int(match[1])
                indices = set()
                for node in question.findall("prt/node"):
                    flag = re.fullmatch(rf"flg{truth}L\[(\d+)\]", node.findtext("sans", ""))
                    if flag:
                        indices.add(int(flag[1]))
                if indices != set(range(1, limits[truth] + 1)):
                    raise ValueError(f"{name}: PRT {truth} nodes do not match max_{suffix}")
            capacities.append(limits)
            target = root / "app/mcq-webapp/templates" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.read_bytes() != source.read_bytes():
                target.write_bytes(source.read_bytes())
        if capacities[0] != capacities[1]:
            raise ValueError(f"{variant or 'standard'}: rb/cb capacities differ")


if __name__ == "__main__":
    sync_templates()
    print("MCQ templates: capacities verified; static copies synchronized.")
