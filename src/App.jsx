import React, { useState, useEffect } from 'react'
import { auth, db } from './firebase'
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
import { ChevronLeft, ChevronRight, LogOut, User } from 'lucide-react'
import emailjs from '@emailjs/browser'

export default function App() {
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
    user_name: ''
  })
  const [loading, setLoading] = useState(false)

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSession(user)
    })
    return () => unsubscribe()
  }, [])

  // 新規登録時のウェルカムメール送信関数（登録者 ＆ ronron201907@gmail.com へ送信）
  const sendWelcomeEmail = async (userEmail) => {
    try {
      const templateParams = {
        to_email: userEmail,
        admin_email: 'ronron201907@gmail.com',
        message: 'ようこそ、ロン大好きに登録いただきありがとうございます！'
      }

      await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams, 'YOUR_PUBLIC_KEY')
      
      const adminParams = {
        ...templateParams,
        to_email: 'ronron201907@gmail.com'
      }
      await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', adminParams, 'YOUR_PUBLIC_KEY')

      console.log("ウェルカムメールの送信が完了しました。")

    } catch (mailError) {
      console.warn("ウェルカムメールの送信に失敗しましたが、登録処理は継続します:", mailError)
    }
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
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const fetchMonthData = async () => {
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
  }

  // 選択日のデータ取得
  useEffect(() => {
    if (session && viewMode === 'day') {
      fetchDayData(selectedDate)
    }
  }, [selectedDate, viewMode, session])

  const fetchDayData = async (date) => {
    setLoading(true)
    setCurrentTask({
      check1: false, time1: '', gram1: 15,
      check2: false, time2: '', gram2: 15,
      check3: false, time3: '', gram3: 15,
      note: '',
      user_name: ''
    })

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
      }
    } catch (error) {
      console.error("日データ取得エラー:", error)
    }
    setLoading(false)
  }

  const isFutureDate = (date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(date)
    target.setHours(0, 0, 0, 0)
    return target > today
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

  const saveDayData = async (taskToSave) => {
    const dateKey = formatDateKey(selectedDate)
    const docId = `${session.uid}_${dateKey}`

    try {
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
        updated_at: new Date()
      })
      fetchMonthData()
    } catch (error) {
      console.error("データ保存エラー:", error)
    }
  }

  const changeDay = (days) => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + days)
    setSelectedDate(newDate)
  }

  const changeMonth = (months) => {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() + months)
    setCurrentDate(newDate)
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
          <div>
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
                      onClick={() => {
                        setSelectedDate(dateObj)
                        setViewMode('day')
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
                            <span style={styles.badgeCheck}>チェック: {checkedCount}</span>
                            <span style={styles.badgeGram}>合計: {sumGrams}g</span>
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
          <div>
            <div style={styles.navHeader}>
              <button onClick={() => changeDay(-1)} style={styles.navButton}><ChevronLeft /> 前日</button>
              <h2>{selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月 {selectedDate.getDate()}日</h2>
              <button onClick={() => changeDay(1)} style={styles.navButton}>翌日 <ChevronRight /></button>
            </div>

            <div style={styles.topSubBar}>
              <button onClick={() => setViewMode('month')} style={styles.secondaryButton}>
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
                <h3>作業チェック項目</h3>
                
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
                    作業項目 1
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
                    作業項目 2
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
                    作業項目 3
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
                  <label style={styles.noteLabel}>メモ・コメント（複数行入力可能）：</label>
                  <textarea
                    value={currentTask.note}
                    onChange={(e) => handleFieldChange('note', e.target.value)}
                    rows={4}
                    style={styles.textarea}
                    placeholder="作業の詳細や気付いたことを入力してください..."
                  />
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
  textarea: { padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', width: '100%', resize: 'vertical' }
}