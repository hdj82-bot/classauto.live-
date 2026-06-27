"""자유게시판 API (베타 테스터 커뮤니티 — 글 + 댓글).

권한 모델(결정 2026-06-27):
- 열람(GET): 누구나 — 비로그인 포함(``get_current_user_optional``).
- 작성(POST 글/댓글): 로그인 사용자만(``get_current_user``).
- 삭제(DELETE): 작성자 본인 또는 운영자(역할 admin 또는 ADMIN_EMAILS).

운영자에게만 가는 비공개 ``feedback`` 과 달리, 여기 글은 테스터끼리 공개로 공유한다.
공개 노출은 표시 이름(author_name)만 하고 이메일은 절대 노출하지 않는다.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_current_user_optional
from app.core.config import settings
from app.db.session import get_db
from app.models.board import BoardComment, BoardPost
from app.models.user import User
from app.schemas.board import (
    BoardCommentCreateRequest,
    BoardCommentResponse,
    BoardPostCreateRequest,
    BoardPostDetail,
    BoardPostListResponse,
    BoardPostSummary,
)

router = APIRouter(tags=["board"])


def _is_moderator(user: User | None) -> bool:
    """운영자(글·댓글 삭제 권한) 여부 — 역할 admin 또는 ADMIN_EMAILS 계정주."""
    if user is None:
        return False
    if user.role.value == "admin":
        return True
    return (user.email or "").strip().lower() in settings.admin_email_set


def _display_name(user: User) -> str:
    """공개 표시 이름 — 이름 우선, 없으면 이메일 로컬파트, 그것도 없으면 '익명'."""
    name = (user.name or "").strip()
    if name:
        return name[:120]
    email = (user.email or "").strip()
    if email and "@" in email:
        return email.split("@", 1)[0][:120]
    return "익명"


def _can_delete(author_id: uuid.UUID | None, user: User | None) -> bool:
    if user is None:
        return False
    if _is_moderator(user):
        return True
    return author_id is not None and author_id == user.id


def _comment_to_response(
    c: BoardComment, viewer: User | None
) -> BoardCommentResponse:
    return BoardCommentResponse(
        id=str(c.id),
        author_name=c.author_name,
        body=c.body,
        created_at=c.created_at,
        can_delete=_can_delete(c.author_id, viewer),
    )


@router.get(
    "/api/v1/board/posts",
    response_model=BoardPostListResponse,
    summary="자유게시판 글 목록 (공개)",
)
async def list_board_posts(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """공개 글 목록 — 고정 글 우선, 그 다음 최신순. 댓글 수 포함."""
    total = (
        await db.execute(select(func.count()).select_from(BoardPost))
    ).scalar() or 0

    # 글당 댓글 수를 한 번에 — 글:댓글 LEFT JOIN 후 group by.
    stmt = (
        select(BoardPost, func.count(BoardComment.id))
        .outerjoin(BoardComment, BoardComment.post_id == BoardPost.id)
        .group_by(BoardPost.id)
        .order_by(BoardPost.pinned.desc(), BoardPost.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    posts = [
        BoardPostSummary(
            id=str(post.id),
            author_name=post.author_name,
            title=post.title,
            pinned=post.pinned,
            comment_count=int(comment_count or 0),
            created_at=post.created_at,
        )
        for post, comment_count in rows
    ]
    return BoardPostListResponse(total=total, page=page, limit=limit, posts=posts)


@router.get(
    "/api/v1/board/posts/{post_id}",
    response_model=BoardPostDetail,
    summary="자유게시판 글 상세 (공개)",
)
async def get_board_post(
    post_id: uuid.UUID,
    viewer: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """글 본문 + 댓글 전체. 삭제 가능 여부는 열람자 기준으로 표시한다."""
    stmt = (
        select(BoardPost)
        .where(BoardPost.id == post_id)
        .options(selectinload(BoardPost.comments))
    )
    post = (await db.execute(stmt)).scalar_one_or_none()
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="글을 찾을 수 없습니다."
        )

    comments = sorted(post.comments, key=lambda c: c.created_at)
    return BoardPostDetail(
        id=str(post.id),
        author_name=post.author_name,
        title=post.title,
        body=post.body,
        pinned=post.pinned,
        created_at=post.created_at,
        comments=[_comment_to_response(c, viewer) for c in comments],
        can_delete=_can_delete(post.author_id, viewer),
    )


@router.post(
    "/api/v1/board/posts",
    response_model=BoardPostDetail,
    status_code=status.HTTP_201_CREATED,
    summary="자유게시판 글 작성 (로그인 필요)",
)
async def create_board_post(
    body: BoardPostCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = BoardPost(
        id=uuid.uuid4(),
        author_id=user.id,
        author_name=_display_name(user),
        title=body.title,
        body=body.body,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return BoardPostDetail(
        id=str(post.id),
        author_name=post.author_name,
        title=post.title,
        body=post.body,
        pinned=post.pinned,
        created_at=post.created_at,
        comments=[],
        can_delete=True,
    )


@router.post(
    "/api/v1/board/posts/{post_id}/comments",
    response_model=BoardCommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="자유게시판 댓글 작성 (로그인 필요)",
)
async def create_board_comment(
    post_id: uuid.UUID,
    body: BoardCommentCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(BoardPost, post_id)
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="글을 찾을 수 없습니다."
        )
    comment = BoardComment(
        id=uuid.uuid4(),
        post_id=post_id,
        author_id=user.id,
        author_name=_display_name(user),
        body=body.body,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return _comment_to_response(comment, user)


@router.delete(
    "/api/v1/board/posts/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="자유게시판 글 삭제 (작성자 또는 운영자)",
)
async def delete_board_post(
    post_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(BoardPost, post_id)
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="글을 찾을 수 없습니다."
        )
    if not _can_delete(post.author_id, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="삭제 권한이 없습니다."
        )
    await db.delete(post)  # 댓글은 FK CASCADE 로 함께 삭제.
    await db.commit()


@router.delete(
    "/api/v1/board/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="자유게시판 댓글 삭제 (작성자 또는 운영자)",
)
async def delete_board_comment(
    comment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(BoardComment, comment_id)
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="댓글을 찾을 수 없습니다."
        )
    if not _can_delete(comment.author_id, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="삭제 권한이 없습니다."
        )
    await db.delete(comment)
    await db.commit()
