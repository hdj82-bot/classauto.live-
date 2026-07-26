"""아바타 렌더 단가의 단일 출처 — 드리프트 감시 (스펙 13 §C-1).

**왜 이 모듈이 있나**: `HEYGEN_COST_USD_PER_SECOND` 가 코드 기본값(0.0167)과 Railway
env 에서 갈렸는데 **아무도 몰랐다.** 예산 브레이커·비용 집계·인원 산정이 전부 이 값에
매달려 있는데도, 어느 값이 실제로 적용 중인지 확인할 방법이 없었던 게 근본 문제다.

그래서 유효 단가를 여기 한 곳에서 계산하고,
  · 부팅 시 구조화 로그로 1행 남기고,
  · 운영자 콘솔 예산 API 가 그대로 내려주고,
  · 두 단가의 비율이 코드가 전제하는 값과 다르면 경고한다.

**두 단가는 결합돼 있다.** `VISIONSTORY_COST_USD_PER_SECOND`(0.0334)는
`HEYGEN_COST_USD_PER_SECOND`(0.0167)의 **정확히 2배로 유도된 값**이다(config.py 주석,
2026-06-19). 그래서 env 로 **한쪽만** 덮으면 이 전제가 조용히 깨진다 — 예컨대 HeyGen 만
0.0083 으로 낮추면 비율이 2 가 아니라 4 가 된다. 조정은 반드시 함께 한다.
"""
from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# config.py 가 VisionStory 단가를 HeyGen 의 몇 배로 유도했는지.
EXPECTED_VS_TO_HEYGEN_RATIO = 2.0
# 부동소수 비교 허용 오차.
RATIO_TOLERANCE = 0.01


def visionstory_to_heygen_ratio() -> float | None:
    """VisionStory / HeyGen 단가 비율. HeyGen 단가가 0이면 None(회계 비활성)."""
    heygen = settings.HEYGEN_COST_USD_PER_SECOND
    if not heygen:
        return None
    return settings.VISIONSTORY_COST_USD_PER_SECOND / heygen


def ratio_is_consistent() -> bool:
    """두 단가가 코드가 전제하는 관계(2배)를 유지하고 있는가.

    False 면 한쪽만 env override 됐을 가능성이 크다.
    """
    ratio = visionstory_to_heygen_ratio()
    if ratio is None:
        return True  # 회계 비활성 — 비율을 따질 대상이 아니다.
    return abs(ratio - EXPECTED_VS_TO_HEYGEN_RATIO) <= RATIO_TOLERANCE


def effective_unit_costs() -> dict:
    """지금 실제로 적용 중인 단가 묶음. 콘솔·부팅 로그가 공유한다."""
    ratio = visionstory_to_heygen_ratio()
    return {
        "heygen_usd_per_second": settings.HEYGEN_COST_USD_PER_SECOND,
        "visionstory_usd_per_second": settings.VISIONSTORY_COST_USD_PER_SECOND,
        "visionstory_to_heygen_ratio": None if ratio is None else round(ratio, 4),
        "expected_ratio": EXPECTED_VS_TO_HEYGEN_RATIO,
        "ratio_consistent": ratio_is_consistent(),
    }


def log_effective_unit_costs() -> None:
    """부팅 시 유효 단가를 1행 남긴다.

    이 로그가 없으면 "지금 어느 단가로 돌고 있나"를 알려면 셸에 붙어야 한다. 서비스가
    셋(web/worker/beat)이라 **한 서비스만 env 가 다른 상황**도 이 로그로 드러난다.
    """
    costs = effective_unit_costs()
    logger.info(
        "[COST] 유효 단가 heygen=%s/sec visionstory=%s/sec ratio=%s (기대 %s)",
        costs["heygen_usd_per_second"],
        costs["visionstory_usd_per_second"],
        costs["visionstory_to_heygen_ratio"],
        costs["expected_ratio"],
        extra={"unit_costs": costs},
    )
    if not costs["ratio_consistent"]:
        logger.warning(
            "[COST] 단가 비율이 %s 가 아니다(현재 %s) — 한쪽만 env override 된 상태일 수 "
            "있다. VisionStory 단가는 HeyGen 에서 유도된 값이라 둘은 함께 조정해야 한다 "
            "(스펙 13 §C-1).",
            costs["expected_ratio"],
            costs["visionstory_to_heygen_ratio"],
            extra={"unit_costs": costs},
        )
