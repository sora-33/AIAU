window.AIAU_DATA = {
  trip: {
    title: "週末の東京アート旅",
    dateLabel: "10月18日（土）〜 10月19日（日）",
    members: [
      { name: "ゆき", initials: "ゆ" },
      { name: "けん", initials: "け" },
      { name: "あい", initials: "あ" }
    ]
  },
  messages: [
    {
      id: "message-museum",
      author: "ゆき",
      initials: "ゆ",
      text: "土曜の午前は美術館に行きたいな。東京都美術館が気になる！",
      time: "09:18"
    },
    {
      id: "message-ramen",
      author: "けん",
      initials: "け",
      text: "お昼は駅前のラーメンも行ってみたい。並ぶなら早めがいいかも。",
      time: "09:24"
    },
    {
      id: "message-market",
      author: "あい",
      initials: "あ",
      text: "谷中銀座を散歩するのもよさそう。夕方なら夕焼けも見られそうだね。",
      time: "09:31"
    },
    {
      id: "message-hold",
      author: "けん",
      initials: "け",
      text: "ラーメンは今回はなしで、美術館の滞在を長めにしよう。",
      time: "09:42"
    }
  ],
  notes: [
    {
      id: "note-museum",
      title: "東京都美術館",
      memo: "企画展をゆっくり見る。チケットは事前購入できそう。",
      attrs: ["上野公園", "約2時間", "午前", "1,800円"],
      origin: "ai",
      source: "message-museum",
      sourceLabel: "ゆき「美術館に行きたい」",
      x: 6,
      y: 9
    },
    {
      id: "note-ramen",
      title: "駅前ラーメン",
      memo: "上野駅前の人気店。混雑状況を見て判断。",
      attrs: ["上野駅・広小路口", "約45分", "昼", "1,200円"],
      origin: "ai",
      source: "message-ramen",
      sourceLabel: "けん「駅前のラーメン」",
      status: "held",
      holdReason: "今回は見送り",
      x: 51,
      y: 12
    },
    {
      id: "note-yanaka",
      title: "谷中銀座を散歩",
      memo: "夕焼けだんだんで写真を撮りたい。",
      attrs: ["台東区谷中", "約1時間30分", "夕方", "無料"],
      origin: "ai",
      source: "message-market",
      sourceLabel: "あい「谷中銀座を散歩」",
      x: 25,
      y: 55
    },
    {
      id: "note-cafe",
      title: "古書店カフェで休憩",
      memo: "歩き疲れたら立ち寄る候補。電源あり。",
      attrs: ["根津駅から徒歩5分", "約45分", "午後", "800円〜"],
      origin: "user",
      source: null,
      sourceLabel: null,
      x: 63,
      y: 58
    }
  ],
  plans: [
    {
      id: "plan-museum",
      noteId: "note-museum",
      title: "東京都美術館",
      time: "10:00–12:00",
      start: "10:00",
      end: "12:00",
      location: "上野公園",
      type: "plan",
      status: "adopted",
      votes: 7
    },
    {
      id: "plan-museum-option",
      noteId: "note-museum",
      title: "国立西洋美術館",
      time: "10:00–11:30",
      start: "10:00",
      end: "11:30",
      location: "上野公園",
      type: "option",
      status: "option",
      votes: 4
    },
    {
      id: "plan-lunch-option",
      noteId: "note-ramen",
      title: "駅前ラーメン",
      time: "12:15–13:00",
      start: "12:15",
      end: "13:00",
      location: "上野駅・広小路口",
      type: "option",
      status: "option",
      votes: 2
    },
    {
      id: "plan-cafe",
      noteId: "note-cafe",
      title: "古書店カフェで休憩",
      time: "13:15–14:00",
      start: "13:15",
      end: "14:00",
      location: "根津",
      type: "plan",
      status: "draft",
      votes: 6
    },
    {
      id: "plan-market",
      noteId: "note-yanaka",
      title: "谷中銀座を散歩",
      time: "16:00–17:30",
      start: "16:00",
      end: "17:30",
      location: "台東区谷中",
      type: "plan",
      status: "adopted"
    }
  ],
  calendarEvents: [
    {
      id: "event-hotel",
      title: "上野のホテル（チェックイン）",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "終日",
      allDay: true,
      detail: "チェックイン 15:00 / チェックアウト 10:00",
      location: "上野駅から徒歩8分",
      color: "coral",
      top: 65,
      height: 130,
      left: "18px",
      right: "18px"
    },
    {
      id: "event-museum",
      title: "東京都美術館",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "10:00–12:00",
      detail: "企画展をゆっくり見る。チケットは事前購入。",
      location: "上野公園",
      cost: "1,800円",
      color: "coral",
      top: 65,
      height: 130,
      left: "18px",
      right: "18px",
      noteId: "note-museum",
      planId: "plan-museum"
    },
    {
      id: "event-move",
      title: "移動：上野 → 根津",
      type: "plan",
      label: "移動",
      date: "10/18",
      time: "12:00–12:15",
      detail: "徒歩または東京メトロで移動",
      location: "上野駅から根津駅",
      color: "lavender",
      top: 195,
      height: 24,
      left: "18px",
      right: "18px"
    },
    {
      id: "event-lunch",
      title: "家族との昼食",
      type: "personal",
      label: "個人",
      date: "10/18",
      time: "12:15–13:00",
      detail: "合流できたら一緒に昼食。プラン候補と時間が重なっています。",
      location: "上野駅・広小路口",
      color: "blue",
      top: 219,
      height: 52,
      left: "43%",
      right: "18px"
    },
    {
      id: "event-undecided",
      title: "未定：昼食の候補を選択",
      type: "undecided",
      label: "未定",
      date: "10/18",
      time: "12:15–13:00",
      detail: "画面2で投票中の候補があります。",
      color: "dashed",
      top: 219,
      height: 52,
      left: "18px",
      right: "58%",
      planId: "plan-lunch-option"
    },
    {
      id: "event-cafe",
      title: "古書店カフェで休憩",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "13:15–14:00",
      detail: "歩き疲れたら立ち寄る候補。電源あり。",
      location: "根津",
      color: "coral",
      top: 282,
      height: 49,
      left: "18px",
      right: "18px",
      noteId: "note-cafe",
      planId: "plan-cafe"
    },
    {
      id: "event-market",
      title: "谷中銀座を散歩",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "16:00–17:30",
      detail: "夕焼けだんだんで写真を撮る。",
      location: "台東区谷中",
      color: "coral",
      top: 455,
      height: 98,
      left: "18px",
      right: "18px",
      noteId: "note-yanaka",
      planId: "plan-market"
    },
    {
      id: "event-train",
      title: "新幹線（帰り）",
      type: "external",
      label: "外部",
      date: "10/19",
      time: "17:30–19:45",
      detail: "東京駅 → 新大阪駅",
      location: "東京駅",
      color: "green",
      top: 0,
      height: 0,
      left: "18px",
      right: "18px"
    }
  ],
  history: [
    {
      id: "v8",
      date: "10月18日（土）",
      time: "09:46",
      author: "けん",
      title: "投票結果を反映",
      summary: "美術館の採用案を東京都美術館に確定"
    },
    {
      id: "v7",
      date: "10月18日（土）",
      time: "09:44",
      author: "AI",
      title: "プランを再構成",
      summary: "付箋の更新を検知し、昼食候補を追加"
    },
    {
      id: "v6",
      date: "10月17日（金）",
      time: "21:10",
      author: "ゆき",
      title: "付箋から更新",
      summary: "「谷中銀座を散歩」の希望時間帯を夕方へ変更"
    },
    {
      id: "v5",
      date: "10月17日（金）",
      time: "20:52",
      author: "匿名ユーザー",
      title: "予定を追加",
      summary: "古書店カフェで休憩を候補に追加"
    }
  ]
};
