import React, { useState, useEffect } from 'react'
import { initializeApp } from 'firebase/app'
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  Timestamp 
} from 'firebase/firestore'

// Firebaseの設定（環境に合わせて適宜書き換えてください）
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// 日付を YYYY-MM-DD 形式のキー文字列に変換する関数
const formatDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function App() {
  // ユーザーセッション（簡易版）
  const [session, setSession] = useState({ uid: 'default_user', name: '管理者' })
  
  // 画面管理: 'day'（日めくり） または 'month'（月カレンダー）
  const [currentView, setCurrentView] = useState('day')
  
  // 選択中の日付
  const [currentDate, setCurrentDate] = useState(new Date())
  
  // ロード中フラグ
  const [loading, setLoading] = useState(false)

  // 日めくり画面の入力フォーム用ステート
  const [currentTask, setCurrentTask] = useState({
    check1: false, time1: '', gram1: 15,
    check2: false, time2: '', gram2: 15,
    check3: false, time3: '', gram3: 15,
    note: '',
    user_name: ''
  })

  // 月カレンダー画面用ステート（キー：YYYY-MM-DD、値：データ）
  const [monthTasks, setMonthTasks] = useState({})

  // 日付変更時やビュー切り替え時にデータを取得
  useEffect(() => {
    if (currentView === 'day') {
      fetchDayData(currentDate)
    } else {
      fetchMonthData()
    }
  }, [currentDate, currentView])

  // 指定日のデータをFirestoreから取得
  const fetchDayData = async (date) => {
    setLoading(true)
    const dateKey = formatDateKey(date)
    const docId = `${session.uid}_${dateKey}`
    
    try {
      const docRef = doc(db, 'daily_tasks', docId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        const data = docSnap.data()
        setCurrentTask({
          check1: data.check1 || false,
          time1: data.time1 || '',
          gram1: data.gram1 !== undefined ? data.gram1 : 15,
          check2: data.check2 || false,
          time2: data.time2 || '',
          gram2: data.gram2 !== undefined ? data.gram2 : 15,
          check3: data.check3 || false,
          time3: data.time3 || '',
          gram3: data.gram3 !== undefined ? data.gram3 : 15,
          note: data.note || '',
          user_name: data.user_name || ''
        })
      } else {
        // データが存在しない場合は確実に初期状態にリセット
        setCurrentTask({
          check1: false, time1: '', gram1: 15,
          check2: false, time2: '', gram2: 15,
          check3: false, time3: '', gram3: 15,
          note: '',
          user_name: ''
        })
      }
    } catch (error) {
      console.error("日データ取得エラー:", error)
    }
    setLoading(false)
  }

  // 今月分のデータをFirestoreから取得（複合インデックス使用）
  const fetchMonthData = async () => {
    setLoading(true)
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const startDateStr = formatDateKey(new Date(year, month, 1))
    const endDateStr = formatDateKey(new Date(year, month + 1, 0))

    try {
      const q = query(
        collection(db, 'daily_tasks'),
        where('user_id', '==', session.uid),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      )
      const querySnapshot = await getDocs(q)
      const map = {}
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data()
        if (data.date) {
          map[data.date] = data
        }
      })
      setMonthTasks(map)
    } catch (error) {
      console.error("月データ取得エラー:", error)
    }
    setLoading(false)
  }

  // データの保存（自動保存または保存ボタン押下時）
  const handleSave = async (updatedFields) => {
    const newtask = { ...currentTask, ...updatedFields }
    setCurrentTask(newtask)

    const dateKey = formatDateKey(currentDate)
    const docId = `${session.uid}_${dateKey}`

    try {
      await setDoc(doc(db, 'daily_tasks', docId), {
        user_id: session.uid,
        date: dateKey,
        ...newtask,
        updated_at: Timestamp.now()
      }, { merge: true })
    } catch (error) {
      console.error("データ保存エラー:", error)
    }
  }

  // 日付を前後に移動するハンドラー
  const changeDate = (days) => {
    const nextDate = new Date(currentDate)
    nextDate.setDate(nextDate.getDate() + days)
    setCurrentDate(nextDate)
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>デイリータスク管理</h1>

      {/* ナビゲーション切り替えボタン */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button 
          onClick={() => setCurrentView('day')}
          style={{ background: currentView === 'day' ? '#007bff' : '#ccc', color: '#fff', padding: '8px 16px', border: 'none', borderRadius: '4px' }}
        >
          日めくりビュー
        </button>
        <button 
          onClick={() => setCurrentView('month')}
          style={{ background: currentView === 'month' ? '#007bff' : '#ccc', color: '#fff', padding: '8px 16px', border: 'none', borderRadius: '4px' }}
        >
          月カレンダービュー
        </button>
      </div>

      {loading && <p>読み込み中...</p>}

      {/* 日めくりビュー */}
      {currentView === 'day' && !loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button onClick={() => changeDate(-1)}>◀ 前日</button>
            <h2>{formatDateKey(currentDate)}</h2>
            <button onClick={() => changeDate(1)}>翌日 ▶</button>
          </div>

          <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              <input 
                type="checkbox" 
                checked={currentTask.check1} 
                onChange={(e) => handleSave({ check1: e.target.checked })} 
              />
              {' '}タスク1を完了
            </label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input 
                type="text" 
                value={currentTask.time1} 
                onChange={(e) => handleSave({ time1: e.target.value })} 
                placeholder="時間 (例: 10:00)"
              />
              <input 
                type="number" 
                value={currentTask.gram1} 
                onChange={(e) => handleSave({ gram1: Number(e.target.value) })} 
                placeholder="数量 (g)"
              />
            </div>
          </div>

          <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              <input 
                type="checkbox" 
                checked={currentTask.check2} 
                onChange={(e) => handleSave({ check2: e.target.checked })} 
              />
              {' '}タスク2を完了
            </label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input 
                type="text" 
                value={currentTask.time2} 
                onChange={(e) => handleSave({ time2: e.target.value })} 
                placeholder="時間 (例: 13:00)"
              />
              <input 
                type="number" 
                value={currentTask.gram2} 
                onChange={(e) => handleSave({ gram2: Number(e.target.value) })} 
                placeholder="数量 (g)"
              />
            </div>
          </div>

          <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              <input 
                type="checkbox" 
                checked={currentTask.check3} 
                onChange={(e) => handleSave({ check3: e.target.checked })} 
              />
              {' '}タスク3を完了
            </label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input 
                type="text" 
                value={currentTask.time3} 
                onChange={(e) => handleSave({ time3: e.target.value })} 
                placeholder="時間 (例: 18:00)"
              />
              <input 
                type="number" 
                value={currentTask.gram3} 
                onChange={(e) => handleSave({ gram3: Number(e.target.value) })} 
                placeholder="数量 (g)"
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>メモ：</label>
            <textarea 
              value={currentTask.note} 
              onChange={(e) => handleSave({ note: e.target.value })} 
              rows="3" 
              style={{ width: '100%', padding: '8px' }}
              placeholder="今日のメモを入力..."
            />
          </div>
        </div>
      )}

      {/* 月カレンダービュー（簡易表示） */}
      {currentView === 'month' && !loading && (
        <div>
          <h2>{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>前の月</button>
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>次の月</button>
          </div>
          <p>今月保存されているデータ数: {Object.keys(monthTasks).length} 日分</p>
          <ul>
            {Object.entries(monthTasks).map(([dateStr, data]) => (
              <li key={dateStr} style={{ marginBottom: '8px' }}>
                <strong>{dateStr}</strong>: 
                {data.check1 ? ' ✅1' : ''}
                {data.check2 ? ' ✅2' : ''}
                {data.check3 ? ' ✅3' : ''}
                {data.note ? ` (メモあり)` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}