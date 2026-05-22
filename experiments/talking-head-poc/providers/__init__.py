"""provider 어댑터를 import 하면 @register 데코레이터가 레지스트리에 등록된다.
run_comparison.py 는 이 패키지만 import 하면 모든 provider 를 얻는다."""
# 참고: LivePortrait 단독은 '구동 영상' 기반이라 (사진+오디오) 인터페이스에 안 맞아
# 단독 provider 로 등록하지 않는다 — musetalk_liveportrait 조합에서만 쓰인다.
from . import musetalk  # noqa: F401
from . import musetalk_liveportrait  # noqa: F401
from . import sadtalker  # noqa: F401
from . import wav2lip  # noqa: F401
from .base import SynthesisResult, build_all, register  # noqa: F401
