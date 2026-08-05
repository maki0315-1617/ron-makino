import React, { useState, useEffect, useRef, Component } from 'react'
import { auth, db } from './firebase' // storageは不要なため削除
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth'
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore'
import { ChevronLeft, ChevronRight, LogOut, User, Image as ImageIcon, Trash2 } from 'lucide-react'

// --- Chrome等でのクラッシュ（画面ホワイトアウト）を防ぐためのErrorBoundaryコンポーネント ---
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("アプリケーションエラーを検知しました:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.errorContainer}>
          <div style={styles.errorBox}>
            <h2>画面の表示中にエラーが発生しました</h2>
            <p style={{ fontSize: '13px', color: '#666', margin: '10px 0 20px' }}>
              お使いのブラウザ環境で一時的な問題が発生した可能性があります。下のボタンより再読み込みしてください。
            </p>
            <button 
              onClick={() => window.location.reload()} 
              style={styles.primaryButton}
            >
              ページを再読み込みする
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  const [viewMode, setViewMode] = useState('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  
  const [monthTasks, setMonthTasks] = useState({})
  
  const [currentTask, setCurrentTask] = useState({
    check1: false, time1: '', gram1: 15,
    check2: false, time2: '', gram2: 15,
    check3: false, time3: '', gram3: 15,
    note: '',
    user_name: '',
    images: [] // Base64形式の文字列の配列を保持
  })
  const [loading, setLoading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)

  // スワイプ検出用の座標記録用Ref
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSession(user)
    })
    return () => unsubscribe()
  }, [])

  // EmailJSのREST API（fetch）を使ったメール送信関数
  const sendWelcomeEmail = async (userEmail) => {
    const SERVICE_ID = 'YOUR_SERVICE_ID'
    const TEMPLATE_ID = 'YOUR_TEMPLATE_ID'
    const PUBLIC_KEY = 'YOUR_PUBLIC_KEY'

    const sendMail = async (recipientEmail, messageText) => {
      try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service_id: SERVICE_ID,
            template_id: TEMPLATE_ID,
            user_id: PUBLIC_KEY,
            template_params: {
              to_email: recipientEmail,
              admin_email: 'ronron201907@gmail.com',
              message: messageText
            }
          })
        })
        if (!response.ok) {
          console.warn("メール送信レスポンスエラー:", await response.text())
        }
      } catch (mailError) {
        console.warn("ウェルカムメールの送信に失敗しましたが、処理は継続します:", mailError)
      }
    }

    await sendMail(userEmail, 'ようこそ、ロン大好きに登録いただきありがとうございます！')
    await sendMail('ronron201907@gmail.com', `新しいユーザーが登録されました: ${userEmail}`)
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError('')
    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        await sendWelcomeEmail(userCredential.user.email)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (error) {
      setAuthError(error.message)
    }
  }

  // 月カレンダー用のデータ取得
  useEffect(() => {
    if (session) {
      fetchMonthData()
    }
  }, [session, currentDate])

  const formatDateKey = (date) => {
    try {
      const d = new Date(date)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    } catch (e) {
      console.error("日付フォーマットエラー:", e)
      return ''
    }
  }

  const fetchMonthData = async () => {
    if (!session || !currentDate) return
    try {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const startDateStr = formatDateKey(new Date(year, month, 1))
      const endDateStr = formatDateKey(new Date(year, month + 1, 0))

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
        if (data && data.date) {
          map[data.date] = data
        }
      })
      setMonthTasks(map)
    } catch (error) {
      console.error("月データ取得エラー:", error)
    }
  }

  // 選択日のデータ取得
  useEffect(() => {
    if (session && viewMode === 'day' && selectedDate) {
      fetchDayData(selectedDate)
    }
  }, [selectedDate, viewMode, session])

  const fetchDayData = async (date) => {
    setLoading(true)
    setImageError('')
    setCurrentTask({
      check1: false, time1: '', gram1: 15,
      check2: false, time2: '', gram2: 15,
      check3: false, time3: '', gram3: 15,
      note: '',
      user_name: '',
      images: []
    })

    try {
      const dateKey = formatDateKey(date)
      if (!dateKey) return
      const docId = `${session.uid}_${dateKey}`
      
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
          user_name: data.user_name || '',
          images: data.images || []
        })
      }
    } catch (error) {
      console.error("日データ取得エラー:", error)
    } finally {
      setLoading(false)
    }
  }

  const isFutureDate = (date) => {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const target = new Date(date)
      target.setHours(0, 0, 0, 0)
      return target > today
    } catch (e) {
      return false
    }
  }

  const handleCheckboxChange = (index) => {
    if (isFutureDate(selectedDate)) return

    const checkKey = `check${index}`
    const timeKey = `time${index}`
    const isChecked = !currentTask[checkKey]

    let newTime = currentTask[timeKey]
    if (isChecked) {
      const now = new Date()
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      newTime = `${hours}:${minutes}`
    } else {
      newTime = ''
    }

    const updated = {
      ...currentTask,
      [checkKey]: isChecked,
      [timeKey]: newTime,
      user_name: session.email
    }

    setCurrentTask(updated)
    saveDayData(updated)
  }

  const handleFieldChange = (field, value) => {
    if (isFutureDate(selectedDate) && field !== 'note') return

    const updated = {
      ...currentTask,
      [field]: value,
      user_name: session.email
    }
    setCurrentTask(updated)
    saveDayData(updated)
  }

  // 画像を読み込んでリサイズ（圧縮）し、Base64文字列に変換するヘルパー関数
  const resizeAndConvertImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target.result
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 600 // 最大幅 600px に制限
          const MAX_HEIGHT = 600
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          // JPEG形式、品質 0.6 で圧縮してBase64に変換
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          resolve(dataUrl)
        }
        img.onerror = (err) => reject(err)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  // 画像アップロード処理（Firestore保存用）
  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageError('')

    // 1. 枚数制限チェック（最大3枚）
    const currentImages = currentTask.images || []
    if (currentImages.length >= 3) {
      setImageError('画像は最大3枚までです。')
      e.target.value = ''
      return
    }

    // 2. ファイル形式チェック（JPGのみ）
    if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') {
      setImageError('ファイル形式はJPG（.jpg / .jpeg）のみアップロード可能です。')
      e.target.value = ''
      return
    }

    // 3. ファイルサイズチェック（元ファイルが大きすぎる場合の保険として5MB以下をチェック）
    const maxSize = 5 * 1024 * 1024 
    if (file.size > maxSize) {
      setImageError('ファイルサイズが大きすぎます。5MB以下の画像を選択してください。')
      e.target.value = ''
      return
    }

    setUploadingImage(true)
    try {
      // 画像を圧縮してBase64に変換
      const base64Image = await resizeAndConvertImage(file)

      const updatedImages = [...currentImages, base64Image]
      const updated = {
        ...currentTask,
        images: updatedImages,
        user_name: session.email
      }

      setCurrentTask(updated)
      await saveDayData(updated)
    } catch (error) {
      console.error("画像処理エラー:", error)
      setImageError('画像の読み込み・圧縮に失敗しました。')
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  // 画像削除処理
  const handleImageDelete = async (indexToRemove) => {
    if (!window.confirm('この画像を削除しますか？')) return
    try {
      const updatedImages = (currentTask.images || []).filter((_, idx) => idx !== indexToRemove)
      const updated = {
        ...currentTask,
        images: updatedImages,
        user_name: session.email
      }

      setCurrentTask(updated)
      await saveDayData(updated)
    } catch (error) {
      console.error("画像削除エラー:", error)
      setImageError('画像の削除に失敗しました。')
    }
  }

  const saveDayData = async (taskToSave) => {
    try {
      const dateKey = formatDateKey(selectedDate)
      if (!dateKey) return
      const docId = `${session.uid}_${dateKey}`

      await setDoc(doc(db, 'daily_tasks', docId), {
        user_id: session.uid,
        user_name: taskToSave.user_name,
        date: dateKey,
        check1: Boolean(taskToSave.check1),
        time1: taskToSave.time1,
        gram1: Number(taskToSave.gram1),
        check2: Boolean(taskToSave.check2),
        time2: taskToSave.time2,
        gram2: Number(taskToSave.gram2),
        check3: Boolean(taskToSave.check3),
        time3: taskToSave.time3,
        gram3: Number(taskToSave.gram3),
        note: taskToSave.note,
        images: taskToSave.images || [], // 圧縮された画像データを保存
        updated_at: new Date()
      })
      fetchMonthData()
    } catch (error) {
      console.error("データ保存エラー:", error)
    }
  }

  const changeDay = (days) => {
    try {
      const newDate = new Date(selectedDate)
      newDate.setDate(newDate.getDate() + days)
      setSelectedDate(newDate)
    } catch (e) {
      console.error("日付変更エラー:", e)
    }
  }

  const changeMonth = (months) => {
    try {
      const newDate = new Date(currentDate)
      newDate.setMonth(newDate.getMonth() + months)
      setCurrentDate(newDate)
    } catch (e) {
      console.error("月変更エラー:", e)
    }
  }

  // スワイプイベントの安全なハンドラー
  const handleTouchStart = (e) => {
    if (e && e.touches && e.touches[0]) {
      touchStartX.current = e.touches[0].clientX
    }
  }

  const handleTouchMove = (e) => {
    if (e && e.touches && e.touches[0]) {
      touchEndX.current = e.touches[0].clientX
    }
  }

  const handleTouchEnd = (e, onLeftSwipe, onRightSwipe) => {
    try {
      if (e && e.changedTouches && e.changedTouches[0]) {
        touchEndX.current = e.changedTouches[0].clientX
      }
      const distance = touchStartX.current - touchEndX.current
      const threshold = 50

      if (Math.abs(distance) > threshold) {
        if (distance > 0) {
          onLeftSwipe()
        } else {
          onRightSwipe()
        }
      }
    } catch (err) {
      console.error("スワイプ処理エラー:", err)
    }
  }

  const totalGrams = (
    (currentTask.check1 ? Number(currentTask.gram1 || 0) : 0) +
    (currentTask.check2 ? Number(currentTask.gram2 || 0) : 0) +
    (currentTask.check3 ? Number(currentTask.gram3 || 0) : 0)
  )

  if (!session) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authBox}>
          <div style={styles.brandHeader}>
            <img src="/ron.png" alt="ロン君" style={styles.smallRonIcon} />
            <h2>ロン大好き</h2>
          </div>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
            {authMode === 'login' ? 'ログイン画面' : '新規登録画面'}
          </p>
          {authError && <p style={{ color: 'red', fontSize: '13px' }}>{authError}</p>}
          <form onSubmit={handleAuth} style={styles.form}>
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" style={styles.primaryButton}>
              {authMode === 'login' ? 'ログイン' : '登録する'}
            </button>
          </form>
          <button 
            onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
            style={styles.textButton}
          >
            {authMode === 'login' ? 'アカウントをお持ちでない方は新規登録' : 'すでにアカウントをお持ちの方はこちら'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerTitleArea}>
          <img src="/ron.png" alt="ロン君" style={styles.smallRonIcon} />
          <h1 style={styles.title}>ロン大好き</h1>
        </div>
        <div style={styles.userInfo}>
          <span style={styles.userEmail}>{session.email}</span>
          <button onClick={() => signOut(auth)} style={styles.logoutButton}>
            <LogOut size={16} /> ログアウト
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {viewMode === 'month' ? (
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={(e) => handleTouchEnd(e, () => changeMonth(1), () => changeMonth(-1))}
          >
            <div style={styles.navHeader}>
              <button onClick={() => changeMonth(-1)} style={styles.iconButton}><ChevronLeft /></button>
              <h2>{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h2>
              <button onClick={() => changeMonth(1)} style={styles.iconButton}><ChevronRight /></button>
            </div>

            <div style={styles.calendarGrid}>
              {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                <div key={i} style={{
                  ...styles.weekHeader,
                  color: i === 0 ? '#d32f2f' : i === 6 ? '#1976d2' : '#333'
                }}>
                  {d}
                </div>
              ))}
              {(() => {
                const year = currentDate.getFullYear()
                const month = currentDate.getMonth()
                const firstDayIndex = new Date(year, month, 1).getDay()
                const totalDays = new Date(year, month + 1, 0).getDate()

                const days = []
                for (let i = 0; i < firstDayIndex; i++) {
                  days.push(<div key={`empty-${i}`} style={styles.emptyCell}></div>)
                }

                const todayStr = formatDateKey(new Date())

                for (let day = 1; day <= totalDays; day++) {
                  const dateObj = new Date(year, month, day)
                  const dateKey = formatDateKey(dateObj)
                  const taskData = monthTasks[dateKey]
                  const dayOfWeek = dateObj.getDay()

                  let checkedCount = 0
                  let hasNote = false
                  let sumGrams = 0

                  if (taskData) {
                    if (taskData.check1) { 
                      checkedCount++; 
                      sumGrams += Number(taskData.gram1 || 0); 
                    }
                    if (taskData.check2) { 
                      checkedCount++; 
                      sumGrams += Number(taskData.gram2 || 0); 
                    }
                    if (taskData.check3) { 
                      checkedCount++; 
                      sumGrams += Number(taskData.gram3 || 0); 
                    }
                    if (taskData.note && typeof taskData.note === 'string' && taskData.note.trim() !== '') {
                      hasNote = true
                    }
                  }

                  const isToday = (dateKey === todayStr)

                  let cellBg = '#fff'
                  if (isToday) {
                    cellBg = '#e8f5e9'
                  } else if (dayOfWeek === 0) {
                    cellBg = '#fff5f5'
                  } else if (dayOfWeek === 6) {
                    cellBg = '#f0f4f8'
                  }

                  days.push(
                    <div
                      key={dateKey}
                      onClick={(e) => {
                        e.stopPropagation()
                        try {
                          setSelectedDate(dateObj)
                          setViewMode('day')
                        } catch (err) {
                          console.error("日表示切り替えエラー:", err)
                        }
                      }}
                      style={{
                        ...styles.dayCell,
                        backgroundColor: cellBg,
                        border: isToday ? '2px solid #2e7d32' : '1px solid #e2e8f0'
                      }}
                    >
                      <div style={{
                        ...styles.dayNumber,
                        color: dayOfWeek === 0 ? '#d32f2f' : dayOfWeek === 6 ? '#1976d2' : '#333'
                      }}>
                        {day} {isToday && <span style={styles.todayBadge}>今日</span>}
                      </div>
                      <div style={styles.cellInfo}>
                        {checkedCount > 0 ? (
                          <>
                            <span style={styles.badgeCheck}>{checkedCount}</span>
                            <span style={styles.badgeGram}>{sumGrams}g</span>
                          </>
                        ) : (
                          <span style={{ color: '#aaa', fontSize: '10px' }}>未記録</span>
                        )}
                        {hasNote && (
                          <span style={styles.badgeNote} title="メモあり">📝</span>
                        )}
                      </div>
                    </div>
                  )
                }
                return days
              })()}
            </div>
          </div>
        ) : (
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={(e) => handleTouchEnd(e, () => changeDay(1), () => changeDay(-1))}
          >
            <div style={styles.navHeader}>
              <button onClick={() => changeDay(-1)} style={styles.navButton}><ChevronLeft /> 前日</button>
              <h2>{selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月 {selectedDate.getDate()}日</h2>
              <button onClick={() => changeDay(1)} style={styles.navButton}>翌日 <ChevronRight /></button>
            </div>

            <div style={styles.topSubBar}>
              <button 
                onClick={(e) => {
                  e.stopPropagation()
                  try {
                    setViewMode('month')
                  } catch (err) {
                    console.error("月カレンダー戻るエラー:", err)
                  }
                }} 
                style={styles.secondaryButton}
              >
                月カレンダーに戻る
              </button>
              {currentTask.user_name && (
                <div style={styles.userBadge}>
                  <User size={14} /> 更新者: {currentTask.user_name}
                </div>
              )}
            </div>

            {isFutureDate(selectedDate) && (
              <div style={styles.futureWarning}>
                ※ 未来日のためチェック・作業内容の入力はできませんが、メモ欄のみ入力・編集が可能です。
              </div>
            )}

            {loading ? <p>読み込み中...</p> : (
              <div style={styles.card}>
                <h3>ロンの一日</h3>
                
                {/* 項目1 */}
                <div style={styles.taskRow}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={currentTask.check1}
                      onChange={() => handleCheckboxChange(1)}
                      disabled={isFutureDate(selectedDate)}
                      style={styles.checkbox}
                    />
                    朝
                  </label>
                  <div style={styles.rowInputs}>
                    <span>時分:</span>
                    <input
                      type="text"
                      value={currentTask.time1}
                      onChange={(e) => handleFieldChange('time1', e.target.value)}
                      disabled={!currentTask.check1 || isFutureDate(selectedDate)}
                      style={styles.smallInput}
                      placeholder="--:--"
                    />
                    <span>グラム:</span>
                    <select
                      value={currentTask.gram1}
                      onChange={(e) => handleFieldChange('gram1', e.target.value)}
                      disabled={!currentTask.check1 || isFutureDate(selectedDate)}
                      style={styles.smallSelect}
                    >
                      <option value="5">5g</option>
                      <option value="10">10g</option>
                      <option value="15">15g</option>
                      <option value="20">20g</option>
                      <option value="25">25g</option>
                      <option value="30">30g</option>
                    </select>
                  </div>
                </div>

                {/* 項目2 */}
                <div style={styles.taskRow}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={currentTask.check2}
                      onChange={() => handleCheckboxChange(2)}
                      disabled={isFutureDate(selectedDate)}
                      style={styles.checkbox}
                    />
                    昼
                  </label>
                  <div style={styles.rowInputs}>
                    <span>時分:</span>
                    <input
                      type="text"
                      value={currentTask.time2}
                      onChange={(e) => handleFieldChange('time2', e.target.value)}
                      disabled={!currentTask.check2 || isFutureDate(selectedDate)}
                      style={styles.smallInput}
                      placeholder="--:--"
                    />
                    <span>グラム:</span>
                    <select
                      value={currentTask.gram2}
                      onChange={(e) => handleFieldChange('gram2', e.target.value)}
                      disabled={!currentTask.check2 || isFutureDate(selectedDate)}
                      style={styles.smallSelect}
                    >
                      <option value="5">5g</option>
                      <option value="10">10g</option>
                      <option value="15">15g</option>
                      <option value="20">20g</option>
                      <option value="25">25g</option>
                      <option value="30">30g</option>
                    </select>
                  </div>
                </div>

                {/* 項目3 */}
                <div style={styles.taskRow}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={currentTask.check3}
                      onChange={() => handleCheckboxChange(3)}
                      disabled={isFutureDate(selectedDate)}
                      style={styles.checkbox}
                    />
                    夜
                  </label>
                  <div style={styles.rowInputs}>
                    <span>時分:</span>
                    <input
                      type="text"
                      value={currentTask.time3}
                      onChange={(e) => handleFieldChange('time3', e.target.value)}
                      disabled={!currentTask.check3 || isFutureDate(selectedDate)}
                      style={styles.smallInput}
                      placeholder="--:--"
                    />
                    <span>グラム:</span>
                    <select
                      value={currentTask.gram3}
                      onChange={(e) => handleFieldChange('gram3', e.target.value)}
                      disabled={!currentTask.check3 || isFutureDate(selectedDate)}
                      style={styles.smallSelect}
                    >
                      <option value="5">5g</option>
                      <option value="10">10g</option>
                      <option value="15">15g</option>
                      <option value="20">20g</option>
                      <option value="25">25g</option>
                      <option value="30">30g</option>
                    </select>
                  </div>
                </div>

                <div style={styles.totalDisplayBox}>
                  <strong>本日の合計グラム数: </strong>
                  <span style={styles.totalValue}>{totalGrams} g</span>
                </div>

                <div style={styles.noteSection}>
                  <label style={styles.noteLabel}>ロンの気づいたことを入力して下さい：</label>
                  <textarea
                    value={currentTask.note}
                    onChange={(e) => handleFieldChange('note', e.target.value)}
                    rows={4}
                    style={styles.textarea}
                    placeholder="作業の詳細や気付いたことを入力してください..."
                  />
                </div>

                {/* 画像投稿セクション（Firestore保存対応・圧縮機能付き） */}
                <div style={styles.imageSection}>
                  <label style={styles.noteLabel}>
                    <ImageIcon size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    写真を追加する (JPG / 最大3枚):
                  </label>
                  
                  {imageError && <p style={styles.errorText}>{imageError}</p>}

                  <div style={styles.imageUploadArea}>
                    {(currentTask.images || []).length < 3 && !isFutureDate(selectedDate) && (
                      <label style={styles.fileUploadButton}>
                        {uploadingImage ? '処理中...' : '画像を選択'}
                        <input
                          type="file"
                          accept=".jpg, .jpeg"
                          onChange={handleImageUpload}
                          style={{ display: 'none' }}
                          disabled={uploadingImage}
                        />
                      </label>
                    )}
                    <span style={styles.imageCountText}>
                      ({(currentTask.images || []).length}/3枚)
                    </span>
                  </div>

                  {/* プレビュー表示 */}
                  <div style={styles.imagePreviewContainer}>
                    {(currentTask.images || []).map((base64Url, idx) => (
                      <div key={idx} style={styles.imagePreviewWrapper}>
                        <img src={base64Url} alt={`アップロード画像 ${idx + 1}`} style={styles.previewImage} />
                        {!isFutureDate(selectedDate) && (
                          <button
                            type="button"
                            onClick={() => handleImageDelete(idx)}
                            style={styles.imageDeleteButton}
                            title="画像を削除"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

const styles = {
  container: { fontFamily: 'sans-serif', maxWidth: '850px', margin: '0 auto', padding: '20px', color: '#333' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '15px', marginBottom: '20px' },
  headerTitleArea: { display: 'flex', alignItems: 'center', gap: '10px' },
  smallRonIcon: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' },
  brandHeader: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '5px' },
  title: { margin: 0, fontSize: '20px' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '10px' },
  userEmail: { fontSize: '14px', color: '#666' },
  logoutButton: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' },
  
  authContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9f9f9' },
  authBox: { background: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', width: '320px', textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' },
  input: { padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' },
  primaryButton: { padding: '10px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '14px', cursor: 'pointer' },
  textButton: { background: 'none', border: 'none', color: '#007bff', marginTop: '15px', cursor: 'pointer', fontSize: '12px' },

  navHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
  iconButton: { background: 'none', border: '1px solid #ccc', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' },
  navButton: { display: 'flex', alignItems: 'center', background: '#f8f9fa', border: '1px solid #ccc', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' },
  
  topSubBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
  userBadge: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', color: '#4a5568' },
  futureWarning: { background: '#fff3cd', color: '#856404', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '14px', textAlign: 'center' },

  calendarGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' },
  weekHeader: { textAlign: 'center', fontWeight: 'bold', padding: '8px 0', background: '#f1f3f5', fontSize: '14px' },
  emptyCell: { background: '#fafafa', minHeight: '90px' },
  dayCell: { minHeight: '90px', padding: '6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '4px' },
  dayNumber: { fontWeight: 'bold', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  todayBadge: { background: '#2e7d32', color: '#fff', fontSize: '10px', padding: '1px 4px', borderRadius: '3px' },
  cellInfo: { display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' },
  badgeCheck: { background: '#e3f2fd', color: '#0d47a1', padding: '2px 4px', borderRadius: '3px', textAlign: 'center' },
  badgeGram: { background: '#e8f5e9', color: '#1b5e20', padding: '2px 4px', borderRadius: '3px', textAlign: 'center' },
  badgeNote: { fontSize: '12px', alignSelf: 'flex-end', marginTop: '2px' },

  secondaryButton: { padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  
  card: { background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
  taskRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f3f5' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', cursor: 'pointer', fontWeight: '500' },
  checkbox: { width: '18px', height: '18px' },
  rowInputs: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' },
  smallInput: { padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', width: '70px', textAlign: 'center' },
  smallSelect: { padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', width: '75px', background: '#fff' },
  
  totalDisplayBox: { margin: '20px 0', padding: '12px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '16px' },
  totalValue: { fontWeight: 'bold', color: '#2b6cb0', fontSize: '18px' },

  noteSection: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' },
  noteLabel: { fontSize: '14px', fontWeight: 'bold' },
  textarea: { padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', width: '100%', resize: 'vertical' },

  imageSection: { marginTop: '20px', borderTop: '1px solid #f1f3f5', paddingTop: '15px' },
  imageUploadArea: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' },
  fileUploadButton: { display: 'inline-block', padding: '6px 12px', background: '#28a745', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
  imageCountText: { fontSize: '13px', color: '#666' },
  errorText: { color: 'red', fontSize: '12px', marginTop: '4px' },
  imagePreviewContainer: { display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' },
  imagePreviewWrapper: { position: 'relative', width: '80px', height: '80px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #ccc' },
  previewImage: { width: '100%', height: '100%', objectFit: 'cover' },
  imageDeleteButton: { position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 },

  errorContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8f9fa' },
  errorBox: { background: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '380px', textAlign: 'center' }
}