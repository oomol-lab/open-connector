import type { JustoneapiEndpoint } from "./endpoint-definition.ts";

import { s } from "../../core/json-schema.ts";

export const socialGlobalEndpoints: readonly JustoneapiEndpoint[] = [
  {
    name: "tiktok_user_published_posts",
    method: "GET",
    path: "/api/tiktok/get-user-post/v1",
    authLocation: "query",
    description:
      "Retrieves posts published by a TikTok user identified by secUid, with cursor pagination and latest or popular sorting. Use it to browse a creator's posting history or continue through their public post feed.",
    inputSchema: s.object(
      "Input for TikTok User Published Posts.",
      {
        secUid: s.string("The opaque security ID returned for the TikTok user.", { minLength: 1 }),
        cursor: s.withDefault(
          s.string(
            "Pagination cursor. Use '0' for the first page, then use the max_cursor value returned in the previous response.",
          ),
          "0",
        ),
        sort: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting criteria for the user's posts.\n\nAvailable Values:\n- `LATEST`: Newest posts first (default)\n- `MOST_POPULAR`: Most popular posts first",
            ),
            ["LATEST", "MOST_POPULAR"],
          ),
          "LATEST",
        ),
      },
      { required: ["secUid"] },
    ),
  },
  {
    name: "tiktok_post_details",
    method: "GET",
    path: "/api/tiktok/get-post-detail/v1",
    authLocation: "query",
    description:
      "Retrieves details for a TikTok post identified by its post ID. Use it to look up a known TikTok video before content review, reporting, or related engagement analysis.",
    inputSchema: s.object(
      "Input for TikTok Post Details.",
      {
        postId: s.string("The unique ID of the TikTok post.", { minLength: 1 }),
      },
      { required: ["postId"] },
    ),
  },
  {
    name: "tiktok_user_profile",
    method: "GET",
    path: "/api/tiktok/get-user-detail/v1",
    authLocation: "query",
    description:
      "Retrieves a TikTok user profile by public username or secUid. Use it to look up a known account for creator research, profile review, or subsequent user-post retrieval.",
    inputSchema: s.object(
      "Input for TikTok User Profile.",
      {
        uniqueId: s.withDefault(s.string("The public TikTok handle or username of the user."), ""),
        secUid: s.withDefault(s.string("The unique security ID of the user."), ""),
      },
      { required: [] },
    ),
  },
  {
    name: "tiktok_post_comments",
    method: "GET",
    path: "/api/tiktok/get-post-comment/v1",
    authLocation: "query",
    description:
      "Retrieves comments for a TikTok post with cursor pagination. Use it to review audience discussion, continue through comment pages, or support comment analysis for a known post.",
    inputSchema: s.object(
      "Input for TikTok Post Comments.",
      {
        awemeId: s.string("The unique ID of the TikTok post (awemeId).", { minLength: 1 }),
        cursor: s.withDefault(s.string("Pagination cursor. Start with '0'."), "0"),
      },
      { required: ["awemeId"] },
    ),
  },
  {
    name: "tiktok_comment_replies",
    method: "GET",
    path: "/api/tiktok/get-post-sub-comment/v1",
    authLocation: "query",
    description:
      "Retrieves replies to a specific comment on a TikTok post with cursor pagination. Use it to inspect threaded discussions and continue through reply pages for a known post comment.",
    inputSchema: s.object(
      "Input for TikTok Comment Replies.",
      {
        awemeId: s.string("The unique ID of the TikTok post.", { minLength: 1 }),
        commentId: s.string("The unique ID of the comment to retrieve replies for.", {
          minLength: 1,
        }),
        cursor: s.withDefault(s.string("Pagination cursor. Start with '0'."), "0"),
      },
      { required: ["awemeId", "commentId"] },
    ),
  },
  {
    name: "tiktok_post_search",
    method: "GET",
    path: "/api/tiktok/search-post/v1",
    authLocation: "query",
    description:
      "Searches TikTok posts by keyword with offset pagination plus sorting, publish-time, and region controls. Use it to support regional content discovery, topic research, or monitoring keyword-related videos.",
    inputSchema: s.object(
      "Input for TikTok Post Search.",
      {
        keyword: s.string("Search keywords.", { minLength: 1 }),
        offset: s.withDefault(s.integer("Pagination offset, starting from 0 and stepping by 20."), 0),
        sortType: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting criteria for search results.\n\nAvailable Values:\n- `RELEVANCE`: Relevance (Default)\n- `MOST_LIKED`: Most Liked",
            ),
            ["RELEVANCE", "MOST_LIKED"],
          ),
          "RELEVANCE",
        ),
        publishTime: s.withDefault(
          s.withEnum(
            s.string(
              "Filter posts by publishing time.\n\nAvailable Values:\n- `ALL`: All Time\n- `ONE_DAY`: Last 24 Hours\n- `ONE_WEEK`: Last 7 Days\n- `ONE_MONTH`: Last 30 Days\n- `THREE_MONTHS`: Last 90 Days\n- `HALF_YEAR`: Last 180 Days",
            ),
            ["ALL", "ONE_DAY", "ONE_WEEK", "ONE_MONTH", "THREE_MONTHS", "HALF_YEAR"],
          ),
          "ALL",
        ),
        region: s.withDefault(s.string("ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB')."), "US"),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "instagram_user_profile",
    method: "GET",
    path: "/api/instagram/get-user-detail/v2",
    authLocation: "query",
    description:
      "Retrieves an Instagram user profile by username. Use it to review a known account before creator research, brand monitoring, or related post analysis.",
    inputSchema: s.object(
      "Input for Instagram User Profile.",
      {
        username: s.string("The Instagram username whose profile details are to be retrieved.", {
          minLength: 1,
        }),
      },
      { required: ["username"] },
    ),
  },
  {
    name: "instagram_post_details",
    method: "GET",
    path: "/api/instagram/get-post-detail/v1",
    authLocation: "query",
    description:
      "Retrieves an Instagram post by its shortcode. Use it to look up a known post before content review, archiving, comment analysis, or related workflows.",
    inputSchema: s.object(
      "Input for Instagram Post Details.",
      {
        code: s.string("The unique shortcode from the Instagram post URL.", { minLength: 1 }),
      },
      { required: ["code"] },
    ),
  },
  {
    name: "instagram_user_published_posts",
    method: "GET",
    path: "/api/instagram/get-user-posts/v1",
    authLocation: "query",
    description:
      "Retrieves posts published by an Instagram user with token-based pagination. Use it to browse a known account's post history or continue through subsequent result pages.",
    inputSchema: s.object(
      "Input for Instagram User Published Posts.",
      {
        username: s.string("The Instagram username whose published posts are to be retrieved.", {
          minLength: 1,
        }),
        paginationToken: s.withDefault(s.string("Token used for retrieving the next page of results."), ""),
      },
      { required: ["username"] },
    ),
  },
  {
    name: "instagram_general_search",
    method: "GET",
    path: "/api/instagram/general-search/v1",
    authLocation: "query",
    description:
      "Performs a general search on Instagram by keyword with token-based pagination. Use it to discover matching results, research topics, and continue through subsequent result pages.",
    inputSchema: s.object(
      "Input for Instagram General Search.",
      {
        keyword: s.string("The keyword to search for on Instagram.", { minLength: 1 }),
        paginationToken: s.withDefault(
          s.string("Pagination token from the previous response. Omit it for the first page."),
          "",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "instagram_reels_search",
    method: "GET",
    path: "/api/instagram/search-reels/v1",
    authLocation: "query",
    description:
      "Searches Instagram Reels by keyword or hashtag with token-based pagination. Use it to discover short-form videos, monitor topics, and continue through matching results.",
    inputSchema: s.object(
      "Input for Instagram Reels Search.",
      {
        keyword: s.string("The search keyword or hashtag to filter Reels.", { minLength: 1 }),
        paginationToken: s.withDefault(s.string("Token used for retrieving the next page of results."), ""),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "instagram_hashtag_posts_search",
    method: "GET",
    path: "/api/instagram/search-hashtag-posts/v1",
    authLocation: "query",
    description:
      "Searches Instagram posts by hashtag with cursor pagination. Use it to explore tagged content, monitor topics, and continue through subsequent result pages.",
    inputSchema: s.object(
      "Input for Instagram Hashtag Posts Search.",
      {
        hashtag: s.string("The hashtag or keyword to search for.", { minLength: 1 }),
        endCursor: s.withDefault(s.string("Cursor used for retrieving the next page of results."), ""),
      },
      { required: ["hashtag"] },
    ),
  },
  {
    name: "instagram_post_comment_list",
    method: "GET",
    path: "/api/instagram/get-post-comments/v1",
    authLocation: "query",
    description:
      "Retrieves top-level comments for an Instagram post by shortcode, with cursor pagination and popular or newest sorting. Use it to review audience feedback or analyze discussion around a known post.",
    inputSchema: s.object(
      "Input for Instagram Post Comment List.",
      {
        code: s.string("The unique shortcode for the Instagram post.", { minLength: 1 }),
        minId: s.withDefault(s.string("Pagination cursor returned as next_min_id from the previous response."), ""),
        sortOrder: s.withDefault(
          s.withEnum(
            s.string("Sort order for the comments.\n\nAvailable Values:\n- `popular`: Popular\n- `newest`: Newest"),
            ["popular", "newest"],
          ),
          "newest",
        ),
      },
      { required: ["code"] },
    ),
  },
  {
    name: "instagram_comment_reply_list",
    method: "GET",
    path: "/api/instagram/get-comment-replies/v1",
    authLocation: "query",
    description:
      "Retrieves replies to a specific Instagram post comment by media and comment IDs, with cursor pagination. Use it to inspect threaded discussion and continue through reply pages.",
    inputSchema: s.object(
      "Input for Instagram Comment Reply List.",
      {
        mediaId: s.string("The numeric media ID of the Instagram post.", { minLength: 1 }),
        commentId: s.string("The parent comment ID whose replies are to be retrieved.", {
          minLength: 1,
        }),
        minId: s.withDefault(
          s.string("Pagination cursor returned as next_min_child_cursor from the previous response."),
          "",
        ),
      },
      { required: ["mediaId", "commentId"] },
    ),
  },
  {
    name: "youtube_general_search",
    method: "GET",
    path: "/api/youtube/search/v1",
    authLocation: "query",
    description:
      "Search YouTube videos by keyword with optional language, upload-date, duration, and sort filters, or continue with a pagination token. Use it to discover public videos or browse additional result pages.",
    inputSchema: s.object(
      "Input for YouTube General Search.",
      {
        keyword: s.withDefault(
          s.string("Search term. Required for the first page; leave empty when using nextToken."),
          "",
        ),
        lang: s.string(
          "Optional IETF language tag for localized results, such as en-US. Leave empty to use the default language.",
        ),
        uploadDate: s.withDefault(
          s.withEnum(
            s.string(
              "Upload-date filter.\n\nAvailable Values:\n- `all`: No upload-date limit\n- `lastHour`: Uploaded within the last hour\n- `today`: Uploaded today\n- `thisWeek`: Uploaded this week\n- `thisMonth`: Uploaded this month\n- `thisYear`: Uploaded this year",
            ),
            ["all", "lastHour", "today", "thisWeek", "thisMonth", "thisYear"],
          ),
          "all",
        ),
        duration: s.withDefault(
          s.withEnum(
            s.string(
              "Video-duration filter.\n\nAvailable Values:\n- `all`: No duration limit\n- `short`: Short videos under 4 minutes\n- `medium`: Medium videos from 4 to 20 minutes\n- `long`: Long videos over 20 minutes",
            ),
            ["all", "short", "medium", "long"],
          ),
          "all",
        ),
        sortBy: s.withDefault(
          s.withEnum(
            s.string(
              "Sort order for search results.\n\nAvailable Values:\n- `relevance`: Sort by relevance\n- `uploadDate`: Sort by upload date\n- `viewCount`: Sort by view count\n- `rating`: Sort by rating",
            ),
            ["relevance", "uploadDate", "viewCount", "rating"],
          ),
          "relevance",
        ),
        nextToken: s.string(
          "Pagination token returned by the previous response. When provided, the keyword and filter parameters are ignored; very long tokens may exceed GET URL limits.",
        ),
      },
      {
        required: [],
        anyOf: [
          { required: ["keyword"], properties: { keyword: { type: "string", minLength: 1 } } },
          { required: ["nextToken"], properties: { nextToken: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "youtube_video_details",
    method: "GET",
    path: "/api/youtube/get-video-detail/v1",
    authLocation: "query",
    description:
      "Retrieve public details for a YouTube video identified by video ID. Use it to inspect a known video before further content or comment analysis.",
    inputSchema: s.object(
      "Input for YouTube Video Details.",
      {
        videoId: s.string("The unique identifier for a YouTube video.", { minLength: 1 }),
        lang: s.string(
          "Optional IETF language tag for localized video details, such as en-US. Leave empty to use the default language.",
        ),
      },
      { required: ["videoId"] },
    ),
  },
  {
    name: "youtube_channel_videos",
    method: "GET",
    path: "/api/youtube/get-channel-videos/v1",
    authLocation: "query",
    description:
      "Retrieve public videos from a YouTube channel, with optional cursor-based pagination. Use it to browse a channel's uploads and continue through additional result pages.",
    inputSchema: s.object(
      "Input for YouTube Channel Videos.",
      {
        channelId: s.string("The unique identifier for a YouTube channel.", { minLength: 1 }),
        cursor: s.string("The cursor for pagination."),
      },
      { required: ["channelId"] },
    ),
  },
  {
    name: "youtube_video_captions",
    method: "GET",
    path: "/api/youtube/get-video-captions/v1",
    authLocation: "query",
    description:
      "Retrieve available caption tracks for a YouTube video or request captions in SRT, XML, JSON3, or plain-text format. Use it to support transcription, accessibility, localization, or text analysis.",
    inputSchema: s.object(
      "Input for YouTube Video Captions.",
      {
        videoId: s.string("The unique identifier for a YouTube video.", { minLength: 1 }),
        languageCode: s.withDefault(
          s.string(
            "Caption language code, such as en, zh-Hans, or a.en. Leave it empty to retrieve available caption tracks.",
          ),
          "",
        ),
        format: s.withDefault(
          s.withEnum(
            s.string(
              "Caption output format.\n\nAvailable Values:\n- `srt`: SubRip caption format with timeline cues\n- `xml`: Original XML caption format\n- `json3`: YouTube original JSON caption structure\n- `txt`: Plain text without timeline cues",
            ),
            ["srt", "xml", "json3", "txt"],
          ),
          "srt",
        ),
      },
      { required: ["videoId"] },
    ),
  },
  {
    name: "youtube_channel_shorts",
    method: "GET",
    path: "/api/youtube/get-channel-shorts/v1",
    authLocation: "query",
    description:
      "Retrieve public Shorts from a YouTube channel ID with optional continuation-token pagination. Use it to browse a channel's short-form videos and continue through additional result pages.",
    inputSchema: s.object(
      "Input for YouTube Channel Shorts.",
      {
        channelId: s.string(
          "The UC-prefixed unique identifier for a YouTube channel. @username handles are not supported.",
          { minLength: 1 },
        ),
        continuationToken: s.withDefault(s.string("Pagination token returned by the previous response."), ""),
      },
      { required: ["channelId"] },
    ),
  },
  {
    name: "youtube_video_comment_list",
    method: "GET",
    path: "/api/youtube/get-video-comment/v1",
    authLocation: "query",
    description:
      "Retrieve first-level comments for a YouTube video with sorting, locale options, and cursor pagination. Use it to review audience discussion or continue through additional comment pages.",
    inputSchema: s.object(
      "Input for YouTube Video Comment List.",
      {
        videoId: s.string("The unique identifier for a YouTube video.", { minLength: 1 }),
        cursor: s.withDefault(s.string("Pagination cursor returned by the previous response."), ""),
        languageCode: s.withDefault(s.string("Language preference for response data."), "zh-CN"),
        countryCode: s.withDefault(s.string("Region code for response data."), "US"),
        sortBy: s.withDefault(
          s.withEnum(
            s.string(
              "Sort order for the comment list.\n\nAvailable Values:\n- `top`: Top comments\n- `newest`: Newest comments",
            ),
            ["top", "newest"],
          ),
          "newest",
        ),
      },
      { required: ["videoId"] },
    ),
  },
  {
    name: "youtube_video_sub_comment_list",
    method: "GET",
    path: "/api/youtube/get-video-sub-comment/v1",
    authLocation: "query",
    description:
      "Retrieve replies associated with a YouTube comment continuation cursor, with optional locale settings. Use it to follow threaded discussion beyond first-level comments.",
    inputSchema: s.object(
      "Input for YouTube Video Sub Comment List.",
      {
        cursor: s.string("Reply cursor from a first-level comment response.", { minLength: 1 }),
        languageCode: s.withDefault(s.string("Language preference for response data."), "zh-CN"),
        countryCode: s.withDefault(s.string("Region code for response data."), "US"),
      },
      { required: ["cursor"] },
    ),
  },
  {
    name: "reddit_post_details",
    method: "GET",
    path: "/api/reddit/get-post-detail/v1",
    authLocation: "query",
    description:
      "Retrieves details for a Reddit post identified by its full post ID. Use it to look up a known post before discussion review, content analysis, or subsequent comment retrieval.",
    inputSchema: s.object(
      "Input for Reddit Post Details.",
      {
        postId: s.string("The Reddit post identifier in t3_<post-id> format.", { minLength: 1 }),
      },
      { required: ["postId"] },
    ),
  },
  {
    name: "reddit_post_comments",
    method: "GET",
    path: "/api/reddit/get-post-comments/v1",
    authLocation: "query",
    description:
      "Retrieves comments for a Reddit post with pagination-token support. Use it to review a thread's discussion or continue through additional comment results for a known post.",
    inputSchema: s.object(
      "Input for Reddit Post Comments.",
      {
        postId: s.string("The unique identifier of the Reddit post.", { minLength: 1 }),
        cursor: s.withDefault(s.string("Pagination token for the next page of results."), ""),
      },
      { required: ["postId"] },
    ),
  },
  {
    name: "reddit_keyword_search",
    method: "GET",
    path: "/api/reddit/search/v1",
    authLocation: "query",
    description:
      "Searches Reddit posts by keyword with an optional continuation token. Use it to discover topic-related discussions or continue through additional search-result pages.",
    inputSchema: s.object(
      "Input for Reddit Keyword Search.",
      {
        keyword: s.string("Search query keywords.", { minLength: 1 }),
        after: s.withDefault(s.string("Pagination token to retrieve the next set of results."), ""),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "facebook_post_search",
    method: "GET",
    path: "/api/facebook/search-post/v1",
    authLocation: "query",
    description:
      "Searches public Facebook posts by keyword with optional inclusive date-range filters and cursor pagination. Use it to find topic-related posts or continue a time-bounded public-content search.",
    inputSchema: s.object(
      "Input for Facebook Post Search.",
      {
        keyword: s.string("Keyword to search for in public posts. Supports basic text matching.", {
          minLength: 1,
        }),
        startDate: s.string("Start date for the search range (inclusive), formatted as yyyy-MM-dd.", {
          format: "date",
        }),
        endDate: s.string("End date for the search range (inclusive), formatted as yyyy-MM-dd.", {
          format: "date",
        }),
        cursor: s.withDefault(s.string("Pagination cursor for fetching the next set of results."), ""),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "facebook_get_profile_id",
    method: "GET",
    path: "/api/facebook/get-profile-id/v1",
    authLocation: "query",
    description:
      "Resolves the Facebook profile ID associated with a submitted profile-path value. Use it to obtain the identifier required before retrieving posts for a known public profile.",
    inputSchema: s.object(
      "Input for Facebook Get Profile ID.",
      {
        url: s.string(
          "The path portion of the Facebook profile URL, such as /<profile-path>. Do not include the scheme or host.",
          { minLength: 1 },
        ),
      },
      { required: ["url"] },
    ),
  },
  {
    name: "facebook_get_profile_posts",
    method: "GET",
    path: "/api/facebook/get-profile-posts/v1",
    authLocation: "query",
    description:
      "Retrieves public posts for a Facebook profile ID with cursor pagination. Use it to browse a known profile's public posting history or continue through subsequent post pages.",
    inputSchema: s.object(
      "Input for Facebook Get Profile Posts.",
      {
        profileId: s.string("The unique Facebook profile ID.", { minLength: 1 }),
        cursor: s.withDefault(s.string("Pagination cursor for fetching the next set of results."), ""),
      },
      { required: ["profileId"] },
    ),
  },
  {
    name: "facebook_post_comments",
    method: "GET",
    path: "/api/facebook/get-post-comments/v1",
    authLocation: "query",
    description:
      "Retrieves comments for a Facebook post ID with cursor pagination. Use it to review discussion associated with a known public post or continue through subsequent comment pages.",
    inputSchema: s.object(
      "Input for Facebook Post Comments.",
      {
        postId: s.string("The unique identifier of the Facebook post.", { minLength: 1 }),
        cursor: s.withDefault(s.string("Pagination cursor for fetching the next set of comments."), ""),
      },
      { required: ["postId"] },
    ),
  },
  {
    name: "facebook_comment_replies",
    method: "GET",
    path: "/api/facebook/get-comment-replies/v1",
    authLocation: "query",
    description:
      "Retrieves replies to a specific Facebook post comment using the legacy post ID, comment ID, and expansion token. Use it to inspect a known comment's nested discussion.",
    inputSchema: s.object(
      "Input for Facebook Comment Replies.",
      {
        postId: s.string("The legacy numeric identifier of the Facebook post.", { minLength: 1 }),
        commentId: s.string("The unique identifier of the parent Facebook comment.", {
          minLength: 1,
        }),
        expansionToken: s.string("The expansion token associated with the parent Facebook comment.", { minLength: 1 }),
      },
      { required: ["postId", "commentId", "expansionToken"] },
    ),
  },
  {
    name: "twitter_search_timeline",
    method: "GET",
    path: "/api/twitter/search/v1",
    authLocation: "query",
    description:
      "Searches X (Twitter) by keyword across top, latest, media, people, or list result modes with cursor pagination. Use it to find public conversations, accounts, media, or lists related to a topic.",
    inputSchema: s.object(
      "Input for Twitter Search Timeline.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        searchType: s.withEnum(
          s.string(
            "Search result type.\n\nAvailable Values:\n- `TOP`: Top search results\n- `LATEST`: Latest search results\n- `MEDIA`: Media search results\n- `PEOPLE`: People search results\n- `LISTS`: List search results",
          ),
          ["TOP", "LATEST", "MEDIA", "PEOPLE", "LISTS"],
        ),
        cursor: s.withDefault(s.string("Pagination cursor returned by the previous response."), ""),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "twitter_user_profile",
    method: "GET",
    path: "/api/twitter/get-user-detail/v1",
    authLocation: "query",
    description:
      "Retrieves an X (Twitter) user profile identified by its numeric Rest ID. Use it to review a known account before monitoring its posts or conducting creator and account research.",
    inputSchema: s.object(
      "Input for Twitter User Profile.",
      {
        restId: s.string("The unique numeric identifier (Rest ID) for the X user.", {
          minLength: 1,
        }),
      },
      { required: ["restId"] },
    ),
  },
  {
    name: "twitter_user_published_posts",
    method: "GET",
    path: "/api/twitter/get-user-posts/v1",
    authLocation: "query",
    description:
      "Retrieves posts published by an X (Twitter) user identified by Rest ID, with cursor pagination. Use it to browse a known account's timeline or continue through its public post history.",
    inputSchema: s.object(
      "Input for Twitter User Published Posts.",
      {
        restId: s.string("The unique numeric identifier (Rest ID) for the X user.", {
          minLength: 1,
        }),
        cursor: s.withDefault(s.string("Pagination cursor for navigating through long timelines."), ""),
      },
      { required: ["restId"] },
    ),
  },
  {
    name: "twitter_post_comments",
    method: "GET",
    path: "/api/twitter/get-post-comments/v1",
    authLocation: "query",
    description:
      "Retrieves the latest comments for an X (Twitter) post identified by tweet ID, with cursor pagination. Use it to review recent discussion on a known post and continue through additional comment pages.",
    inputSchema: s.object(
      "Input for Twitter Post Comments.",
      {
        tweetId: s.string("The unique identifier of the X (Twitter) post.", { minLength: 1 }),
        cursor: s.withDefault(s.string("Pagination cursor returned by the previous response."), ""),
      },
      { required: ["tweetId"] },
    ),
  },
  {
    name: "twitter_post_detail",
    method: "GET",
    path: "/api/twitter/get-post-detail/v1",
    authLocation: "query",
    description:
      "Retrieves the full detail of an X (Twitter) post identified by its tweet ID. Use it to inspect a known post after finding it through search, a user timeline, or an existing post URL.",
    inputSchema: s.object(
      "Input for Twitter Post Detail.",
      {
        tweetId: s.string("The unique identifier of the X (Twitter) post.", { minLength: 1 }),
      },
      { required: ["tweetId"] },
    ),
  },
  {
    name: "linkedin_user_profile",
    method: "GET",
    path: "/api/linkedin/get-user-detail/v1",
    authLocation: "query",
    description:
      "Retrieves a LinkedIn profile by username, including documented core profile fields such as name and headline. Use it to inspect a person's professional background or before requesting published posts.",
    inputSchema: s.object(
      "Input for LinkedIn User Profile.",
      {
        username: s.string("LinkedIn username from the profile URL, for example jack from linkedin.com/in/jack.", {
          minLength: 1,
        }),
      },
      { required: ["username"] },
    ),
  },
  {
    name: "linkedin_company_details",
    method: "GET",
    path: "/api/linkedin/get-company-detail/v1",
    authLocation: "query",
    description:
      "Retrieves a public LinkedIn company profile by its vanity name or company page URL. Use it to research a company and obtain its company identifier before querying company job postings.",
    inputSchema: s.object(
      "Company Details input.",
      { company: s.string("LinkedIn company vanity name or company page URL. School pages are not supported.") },
      { required: ["company"] },
    ),
  },
  {
    name: "linkedin_company_jobs",
    method: "GET",
    path: "/api/linkedin/get-company-jobs/v1",
    authLocation: "query",
    description:
      "Retrieves LinkedIn job postings for companies identified by company IDs, vanity names, or company page URLs, with optional keyword, location, posting age, and pagination filters. Use it to track company hiring activity across one or more employers.",
    inputSchema: s.object(
      "Company Jobs input.",
      {
        companyId: s.string(
          "Comma-separated numeric LinkedIn company IDs, up to 10. Supply companyId or company. Companies are matched as a union; a page may contain jobs from only some selected companies.",
          { default: "" },
        ),
        company: s.string(
          "Comma-separated LinkedIn company vanity names or company page URLs, up to 10. Supply companyId or company. An unknown vanity name fails the request.",
          { default: "" },
        ),
        keyword: s.string("Optional job keyword to search within the selected companies.", { default: "" }),
        location: s.string("Free-text location, such as London, United Kingdom.", { default: "" }),
        page: s.integer("First page to fetch, from 1 to 100. Each page contains up to 10 jobs.", {
          format: "int32",
          default: 1,
        }),
        numPages: s.integer(
          "Number of consecutive pages to fetch, from 1 to 20. The last requested page must not exceed 100.",
          { format: "int32", default: 1 },
        ),
        geoId: s.string("Numeric LinkedIn geographic location ID. Required when radius is supplied.", { default: "" }),
        sortBy: s.withEnum(
          s.string(
            "Sort order. Date sorting applies to the jobs returned in this response.\n\nAvailable Values:\n- `relevance`: Keep relevance ordering\n- `date`: Sort the returned jobs from newest to oldest",
            { default: "relevance" },
          ),
          ["relevance", "date"],
        ),
        datePosted: s.withEnum(
          s.string(
            "Job posting age filter.\n\nAvailable Values:\n- `all`: All posting dates\n- `today`: Posted within the last 24 hours\n- `3days`: Posted within the last 72 hours\n- `week`: Posted within the last 7 days\n- `month`: Posted within the last 30 days",
            { default: "all" },
          ),
          ["all", "today", "3days", "week", "month"],
        ),
        employmentTypes: s.array(
          "Comma-separated employment types. Applying this filter enables job details and may return fewer jobs than the requested page size.",
          s.withEnum(s.string("LinkedIn employment type filter"), ["FULLTIME", "PARTTIME", "CONTRACTOR", "INTERN"]),
        ),
        seniorityLevels: s.array(
          "Comma-separated seniority levels. Applying this filter enables job details and may return fewer jobs than the requested page size.",
          s.withEnum(s.string("LinkedIn job seniority filter"), [
            "Internship",
            "Entry level",
            "Associate",
            "Mid-Senior level",
            "Director",
            "Executive",
            "Not Applicable",
          ]),
        ),
        remoteJobsOnly: s.boolean({
          description: "Return only jobs with an explicit remote marker. This best-effort filter may omit remote jobs.",
          default: false,
        }),
        includeDetails: s.boolean({
          description:
            "Fetch details for up to 100 jobs per request in addition to search cards. Employment and seniority filters enable details regardless of this value.",
          default: true,
        }),
        radius: s.integer("Search radius in kilometres, at least 1. Requires geoId.", { format: "int32" }),
        fields: s.string("Comma-separated job fields to include. job_id and job_title are always included.", {
          default: "",
        }),
      },
      {},
    ),
  },
  {
    name: "linkedin_job_details",
    method: "GET",
    path: "/api/linkedin/get-job-detail/v1",
    authLocation: "query",
    description:
      "Retrieves LinkedIn job details for up to 20 distinct job identifiers, with optional field projection. Use it to inspect selected postings after a job search; unavailable postings are omitted from the result.",
    inputSchema: s.object(
      "Job Details input.",
      {
        jobId: s.string(
          "Comma-separated job IDs returned by job search or raw numeric LinkedIn posting IDs, up to 20 distinct values.",
        ),
        fields: s.string("Comma-separated job fields to include. job_id and job_title are always included.", {
          default: "",
        }),
      },
      { required: ["jobId"] },
    ),
  },
  {
    name: "linkedin_job_search",
    method: "GET",
    path: "/api/linkedin/search-job/v1",
    authLocation: "query",
    description:
      "Searches LinkedIn job postings by keyword with location, posting age, company, employment type, seniority, and pagination filters. Use it to discover recruitment opportunities and research hiring activity.",
    inputSchema: s.object(
      "Job Search input.",
      {
        keyword: s.string("Free-form job search keyword."),
        location: s.string("Free-text location, such as London, United Kingdom.", { default: "" }),
        page: s.integer("First page to fetch, from 1 to 100. Each page contains up to 10 jobs.", {
          format: "int32",
          default: 1,
        }),
        numPages: s.integer(
          "Number of consecutive pages to fetch, from 1 to 20. The last requested page must not exceed 100.",
          { format: "int32", default: 1 },
        ),
        geoId: s.string("Numeric LinkedIn geographic location ID. Required when radius is supplied.", { default: "" }),
        sortBy: s.withEnum(
          s.string(
            "Sort order. Date sorting applies to the jobs returned in this response.\n\nAvailable Values:\n- `relevance`: Keep relevance ordering\n- `date`: Sort the returned jobs from newest to oldest",
            { default: "relevance" },
          ),
          ["relevance", "date"],
        ),
        datePosted: s.withEnum(
          s.string(
            "Job posting age filter.\n\nAvailable Values:\n- `all`: All posting dates\n- `today`: Posted within the last 24 hours\n- `3days`: Posted within the last 72 hours\n- `week`: Posted within the last 7 days\n- `month`: Posted within the last 30 days",
            { default: "all" },
          ),
          ["all", "today", "3days", "week", "month"],
        ),
        employmentTypes: s.array(
          "Comma-separated employment types. Applying this filter enables job details and may return fewer jobs than the requested page size.",
          s.withEnum(s.string("LinkedIn employment type filter"), ["FULLTIME", "PARTTIME", "CONTRACTOR", "INTERN"]),
        ),
        seniorityLevels: s.array(
          "Comma-separated seniority levels. Applying this filter enables job details and may return fewer jobs than the requested page size.",
          s.withEnum(s.string("LinkedIn job seniority filter"), [
            "Internship",
            "Entry level",
            "Associate",
            "Mid-Senior level",
            "Director",
            "Executive",
            "Not Applicable",
          ]),
        ),
        companyId: s.string("Numeric LinkedIn company ID to restrict the search to one company.", { default: "" }),
        remoteJobsOnly: s.boolean({
          description: "Return only jobs with an explicit remote marker. This best-effort filter may omit remote jobs.",
          default: false,
        }),
        includeDetails: s.boolean({
          description:
            "Fetch details for up to 100 jobs per request in addition to search cards. Employment and seniority filters enable details regardless of this value.",
          default: true,
        }),
        radius: s.integer("Search radius in kilometres, at least 1. Requires geoId.", { format: "int32" }),
        fields: s.string("Comma-separated job fields to include. job_id and job_title are always included.", {
          default: "",
        }),
      },
      { required: ["keyword"] },
    ),
  },
];
