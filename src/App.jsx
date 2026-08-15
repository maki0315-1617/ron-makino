import React, { useState, useEffect, useRef, Component } from 'react'
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
import { jsPDF } from 'jspdf'
import { ChevronLeft, ChevronRight, LogOut, User, Image as ImageIcon, Trash2, X, ZoomIn } from 'lucide-react'

// --- Chrome等でのクラッシュを防ぐためのErrorBoundaryコンポーネント ---
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
    sneeze_count: 0,
    blood_sneeze_count: 0,
    hospital_visit: '',
    hospital_weight: 6.0,
    user_name: '',
    images: []
  })
  const [loading, setLoading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [sneezeCounterMode, setSneezeCounterMode] = useState('normal')

  // 画像拡大モーダル用のステート（選択中の画像のインデックスを管理）
  const [modalIndex, setModalIndex] = useState(null)

  // スワイプ検出用の座標記録用Ref
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const modalTouchStartX = useRef(0)
  const modalTouchEndX = useRef(0)

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSession(user)
    })
    return () => unsubscribe()
  }, [])

  const sendWelcomeEmail = async (userEmail) => {
    const SERVICE_ID = 'YOUR_SERVICE_ID'
    const TEMPLATE_ID = 'YOUR_TEMPLATE_ID'
    const PUBLIC_KEY = 'YOUR_PUBLIC_KEY'

    const sendMail = async (recipientEmail, messageText) => {
      try {
        await fetch('https://api.emailjs.com/api/v1.0/email/send', {
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
      } catch (mailError) {
        console.warn("メール送信失敗:", mailError)
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
      return ''
    }
  }

  const generateMonthlyReportPdf = async () => {
    try {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const monthLabel = `${year}/${month + 1}`
      const totalDays = new Date(year, month + 1, 0).getDate()

      const dayValues = []
      let totalNormal = 0
      let totalBlood = 0
      let weightCount = 0
      let totalWeight = 0

      for (let day = 1; day <= totalDays; day++) {
        const dateObj = new Date(year, month, day)
        const dateKey = formatDateKey(dateObj)
        const taskData = monthTasks[dateKey] || {}
        const normal = Number(taskData.sneeze_count || 0)
        const blood = Number(taskData.blood_sneeze_count || 0)
        const weight = taskData.hospital_visit ? Number(taskData.hospital_weight || 6.0) : null

        totalNormal += normal
        totalBlood += blood

        if (weight !== null) {
          totalWeight += weight
          weightCount += 1
        }

        dayValues.push({ day, normal, blood, weight })
      }

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 40
      const usableWidth = pageWidth - margin * 2

      const titleY = 54
      doc.setTextColor(28, 28, 28)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text(`${monthLabel} Ron Record`, margin, titleY)

      const summaryText = `Normal: ${totalNormal} / Blood: ${totalBlood} / Avg weight: ${weightCount ? (totalWeight / weightCount).toFixed(1) : '0.0'}kg`
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.text(summaryText, margin, titleY + 26)

      const chartWidth = usableWidth
      const chartHeight = 100
      const chartY = 110

      const drawLegend = (legendX, legendY) => {
        const entries = [
          { label: 'Normal sneeze', color: [59, 130, 246] },
          { label: 'Blood sneeze', color: [239, 68, 68] },
          { label: 'Weight (kg)', color: [16, 185, 129] }
        ]

        entries.forEach((entry, index) => {
          const x = legendX + index * 150
          doc.setFillColor(...entry.color)
          doc.roundedRect(x, legendY, 12, 8, 2, 2, 'F')
          doc.setTextColor(30, 41, 59)
          doc.setFontSize(9)
          doc.text(entry.label, x + 18, legendY + 7)
        })
      }

      const drawLineChart = ({ title, values, color, yMax, yOffset, startX = margin, startY = chartY + yOffset }) => {
        const x = startX
        const y = startY
        const plotHeight = chartHeight

        doc.setDrawColor(220, 220, 220)
        doc.setLineWidth(0.7)
        doc.rect(x, y, chartWidth, plotHeight)

        doc.setDrawColor(...color)
        doc.setLineWidth(1.3)

        const maxValue = Math.max(yMax, 1)
        const points = values.map((value, index) => {
          const px = x + (index / Math.max(values.length - 1, 1)) * chartWidth
          const py = y + plotHeight - ((Number(value) || 0) / maxValue) * plotHeight
          return { x: px, y: py }
        })

        if (points.length > 0) {
          points.forEach((point, index) => {
            if (index === 0) return
            const prev = points[index - 1]
            doc.line(prev.x, prev.y, point.x, point.y)
          })
        }

        doc.setDrawColor(120, 120, 120)
        doc.setFontSize(8)
        for (let i = 0; i <= 4; i++) {
          const value = ((maxValue / 4) * i).toFixed(0)
          const labelY = y + plotHeight - (i / 4) * plotHeight + 2
          doc.text(value, x - 22, labelY)
        }

        doc.setTextColor(30, 41, 59)
        doc.setFontSize(10)
        doc.text(title, x, y - 10)

        doc.setDrawColor(...color)
        doc.setFillColor(...color)
        points.forEach((point) => {
          doc.circle(point.x, point.y, 2.5, 'F')
        })

        const firstDayLabel = 1
        const midDayLabel = Math.max(1, Math.ceil(totalDays / 2))
        const lastDayLabel = totalDays

        doc.setFontSize(8)
        doc.text(String(firstDayLabel), x, y + plotHeight + 12)
        doc.text(String(midDayLabel), x + chartWidth / 2 - 4, y + plotHeight + 12)
        doc.text(String(lastDayLabel), x + chartWidth - 8, y + plotHeight + 12)
      }

      const maxNormal = Math.max(...dayValues.map((d) => d.normal), 1)
      const maxBlood = Math.max(...dayValues.map((d) => d.blood), 1)
      const maxWeight = Math.max(...dayValues.map((d) => (d.weight !== null ? d.weight : 0)), 10)

      drawLineChart({ title: 'Normal', values: dayValues.map((d) => d.normal), color: [59, 130, 246], yMax: maxNormal, yOffset: 0 })
      drawLineChart({ title: 'Blood', values: dayValues.map((d) => d.blood), color: [239, 68, 68], yMax: maxBlood, yOffset: 120 })
      drawLineChart({ title: 'Weight', values: dayValues.map((d) => (d.weight !== null ? d.weight : 0)), color: [16, 185, 129], yMax: maxWeight, yOffset: 240 })

      drawLegend(margin, pageHeight - 70)

      const fileName = `${year}_${String(month + 1).padStart(2, '0')}_ron_record.pdf`
      doc.save(fileName)
    } catch (error) {
      console.error('PDF生成エラー:', error)
      window.alert('PDF生成に失敗しました。')
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
      sneeze_count: 0,
      blood_sneeze_count: 0,
      hospital_visit: '',
      hospital_weight: 6.0,
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
          sneeze_count: Number(data.sneeze_count || 0),
          blood_sneeze_count: Number(data.blood_sneeze_count || 0),
          hospital_visit: data.hospital_visit || '',
          hospital_weight: data.hospital_weight !== undefined ? Number(data.hospital_weight) : 6.0,
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

  const handleCounterChange = (delta) => {
    if (isFutureDate(selectedDate)) return

    const field = sneezeCounterMode === 'blood' ? 'blood_sneeze_count' : 'sneeze_count'
    const currentValue = Number(currentTask[field] || 0)
    const nextValue = Math.max(0, currentValue + delta)
    const updated = {
      ...currentTask,
      [field]: nextValue,
      user_name: session.email
    }

    setCurrentTask(updated)
    saveDayData(updated)
  }

  const handleFieldChange = (field, value) => {
    const futureAllowedFields = ['note', 'hospital_visit', 'hospital_weight']
    if (isFutureDate(selectedDate) && !futureAllowedFields.includes(field)) return

    const updated = {
      ...currentTask,
      [field]: field === 'hospital_weight' ? (value === '' ? 6.0 : Number(value)) : value,
      user_name: session.email
    }

    if (field === 'hospital_visit' && value === '') {
      updated.hospital_weight = 6.0
    }

    if (field === 'hospital_visit' && value && currentTask.hospital_weight === undefined) {
      updated.hospital_weight = 6.0
    }

    setCurrentTask(updated)
    saveDayData(updated)
  }

  const handleHospitalWeightInput = (value) => {
    if (value === '') {
      handleFieldChange('hospital_weight', 0)
      return
    }

    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) {
      return
    }

    handleFieldChange('hospital_weight', numericValue)
  }

  const handleHospitalWeightStep = (delta) => {
    const currentValue = Number(currentTask.hospital_weight ?? 0)
    const nextValue = Math.max(0, Number((currentValue + delta).toFixed(1)))
    handleFieldChange('hospital_weight', nextValue)
  }

  const resizeAndConvertImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target.result
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 800
          const MAX_HEIGHT = 800
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

          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          resolve(dataUrl)
        }
        img.onerror = (err) => reject(err)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageError('')

    const currentImages = currentTask.images || []
    if (currentImages.length >= 3) {
      setImageError('画像は最大3枚までです。')
      e.target.value = ''
      return
    }

    if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') {
      setImageError('ファイル形式はJPG（.jpg / .jpeg）のみアップロード可能です。')
      e.target.value = ''
      return
    }

    const maxSize = 5 * 1024 * 1024 
    if (file.size > maxSize) {
      setImageError('ファイルサイズが大きすぎます。5MB以下の画像を選択してください。')
      e.target.value = ''
      return
    }

    setUploadingImage(true)
    try {
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
        sneeze_count: Number(taskToSave.sneeze_count || 0),
        blood_sneeze_count: Number(taskToSave.blood_sneeze_count || 0),
        hospital_visit: taskToSave.hospital_visit || '',
        hospital_weight: taskToSave.hospital_visit ? Number(taskToSave.hospital_weight || 6.0) : 6.0,
        images: taskToSave.images || [],
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

  // モーダル内の画像切り替え用スワイプハンドラ
  const handleModalTouchStart = (e) => {
    if (e && e.touches && e.touches[0]) {
      modalTouchStartX.current = e.touches[0].clientX
    }
  }

  const handleModalTouchMove = (e) => {
    if (e && e.touches && e.touches[0]) {
      modalTouchEndX.current = e.touches[0].clientX
    }
  }

  const handleModalTouchEnd = (e) => {
    try {
      if (e && e.changedTouches && e.changedTouches[0]) {
        modalTouchEndX.current = e.changedTouches[0].clientX
      }
      const distance = modalTouchStartX.current - modalTouchEndX.current
      const threshold = 50
      const imagesCount = (currentTask.images || []).length

      if (Math.abs(distance) > threshold) {
        if (distance > 0) {
          // 左スワイプ -> 次の画像へ
          setModalIndex((prev) => (prev < imagesCount - 1 ? prev + 1 : prev))
        } else {
          // 右スワイプ -> 前の画像へ
          setModalIndex((prev) => (prev > 0 ? prev - 1 : prev))
        }
      }
    } catch (err) {
      console.error("モーダルスワイプエラー:", err)
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
            <div style={styles.reportHeaderRow}>
              <button onClick={generateMonthlyReportPdf} style={styles.reportButton}>ロン君の記録</button>
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
                  let hasHospitalVisit = false
                  let sumGrams = 0
                  const sneezeCount = Number(taskData?.sneeze_count || 0)
                  const bloodSneezeCount = Number(taskData?.blood_sneeze_count || 0)

                  if (taskData) {
                    if (taskData.check1) { checkedCount++; sumGrams += Number(taskData.gram1 || 0); }
                    if (taskData.check2) { checkedCount++; sumGrams += Number(taskData.gram2 || 0); }
                    if (taskData.check3) { checkedCount++; sumGrams += Number(taskData.gram3 || 0); }
                    if (taskData.note && typeof taskData.note === 'string' && taskData.note.trim() !== '') {
                      hasNote = true
                    }
                    if (taskData.hospital_visit && typeof taskData.hospital_visit === 'string' && taskData.hospital_visit.trim() !== '') {
                      hasHospitalVisit = true
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

                  if (bloodSneezeCount >= 3) {
                    cellBg = '#8b1e1e'
                  } else if (bloodSneezeCount >= 2) {
                    cellBg = '#f87171'
                  } else if (bloodSneezeCount >= 1) {
                    cellBg = '#fef3c7'
                  } else if (sneezeCount >= 1) {
                    cellBg = '#d9f5dd'
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
                        {hasHospitalVisit && (
                          <span style={styles.badgeHospital} title="通院記録あり">🏥</span>
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

                <div style={styles.counterSection}>
                  <div style={styles.counterItem}>
                    <span style={styles.counterLabel}>クシャミカウント</span>
                    <div style={styles.counterModeRow}>
                      <button
                        type="button"
                        onClick={() => setSneezeCounterMode('normal')}
                        style={{
                          ...styles.counterModeButton,
                          background: sneezeCounterMode === 'normal' ? '#dbeafe' : '#fff',
                          borderColor: sneezeCounterMode === 'normal' ? '#60a5fa' : '#cbd5e1'
                        }}
                      >
                        通常
                      </button>
                      <button
                        type="button"
                        onClick={() => setSneezeCounterMode('blood')}
                        style={{
                          ...styles.counterModeButton,
                          background: sneezeCounterMode === 'blood' ? '#fef3c7' : '#fff',
                          borderColor: sneezeCounterMode === 'blood' ? '#fbbf24' : '#cbd5e1'
                        }}
                      >
                        血
                      </button>
                    </div>

                    <div style={styles.counterControl}>
                      <button
                        type="button"
                        onClick={() => handleCounterChange(-1)}
                        disabled={isFutureDate(selectedDate)}
                        style={{ ...styles.counterButton, opacity: isFutureDate(selectedDate) ? 0.5 : 1 }}
                      >
                        −
                      </button>
                      <span style={styles.counterValue}>
                        {String((sneezeCounterMode === 'blood' ? currentTask.blood_sneeze_count : currentTask.sneeze_count) || 0).padStart(2, '0')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCounterChange(1)}
                        disabled={isFutureDate(selectedDate)}
                        style={{ ...styles.counterButton, opacity: isFutureDate(selectedDate) ? 0.5 : 1 }}
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                </div>

                <div style={styles.hospitalSection}>
                  <label style={styles.noteLabel}>通院記録</label>
                  <div style={styles.hospitalFieldRow}>
                    <select
                      value={currentTask.hospital_visit}
                      onChange={(e) => handleFieldChange('hospital_visit', e.target.value)}
                      style={styles.smallSelect}
                    >
                      <option value="">選択してください</option>
                      <option value="定期通院">定期通院</option>
                      <option value="予防接種">予防接種</option>
                      <option value="病気通院">病気通院</option>
                      <option value="その他">その他</option>
                    </select>

                    {currentTask.hospital_visit && (
                      <div style={styles.weightFieldWrap}>
                        <label style={styles.weightLabel}>体重</label>
                        <div style={styles.weightInputWrap}>
                          <button
                            type="button"
                            onClick={() => handleHospitalWeightStep(-0.1)}
                            style={styles.weightStepButton}
                            aria-label="体重を0.1kg減らす"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            value={currentTask.hospital_weight ?? 0}
                            onChange={(e) => handleHospitalWeightInput(e.target.value)}
                            style={styles.weightInput}
                            placeholder="6.0"
                            aria-label="体重入力"
                          />
                          <button
                            type="button"
                            onClick={() => handleHospitalWeightStep(0.1)}
                            style={styles.weightStepButton}
                            aria-label="体重を0.1kg増やす"
                          >
                            ＋
                          </button>
                          <span style={styles.weightUnit}>kg</span>
                        </div>
                      </div>
                    )}
                  </div>
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

                {/* 画像投稿セクション */}
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
                      <div 
                        key={idx} 
                        style={styles.imagePreviewWrapper}
                        onClick={() => setModalIndex(idx)}
                      >
                        <img src={base64Url} alt={`アップロード画像 ${idx + 1}`} style={styles.previewImage} />
                        
                        <div style={styles.zoomOverlay}>
                          <ZoomIn size={18} color="#fff" />
                        </div>

                        {!isFutureDate(selectedDate) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleImageDelete(idx)
                            }}
                            style={styles.imageDeleteButton}
                            title="画像を削除"
                          >
                            <Trash2 size={16} color="#fff" />
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

      {/* スワイプ・ボタン切り替え対応 画像拡大モーダル */}
      {modalIndex !== null && currentTask.images && currentTask.images[modalIndex] && (
        <div 
          style={styles.modalOverlay} 
          onClick={() => setModalIndex(null)}
          onTouchStart={handleModalTouchStart}
          onTouchMove={handleModalTouchMove}
          onTouchEnd={handleModalTouchEnd}
        >
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button 
              style={styles.modalCloseButton} 
              onClick={() => setModalIndex(null)}
              title="閉じる"
            >
              <X size={20} />
            </button>

            {/* 左切り替えボタン（複数枚かつ最初の画像以外の場合） */}
            {modalIndex > 0 && (
              <button 
                style={{ ...styles.modalNavButton, left: '-50px' }}
                onClick={(e) => {
                  e.stopPropagation()
                  setModalIndex(modalIndex - 1)
                }}
                title="前の画像"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            <div style={styles.modalImageContainer}>
              <img 
                src={currentTask.images[modalIndex]} 
                alt={`拡大表示 ${modalIndex + 1}`} 
                style={styles.modalImage} 
              />
              {/* ページネーション（例: 1 / 3） */}
              <div style={styles.modalPagination}>
                {modalIndex + 1} / {currentTask.images.length}
              </div>
            </div>

            {/* 右切り替えボタン（複数枚かつ最後の画像以外の場合） */}
            {modalIndex < currentTask.images.length - 1 && (
              <button 
                style={{ ...styles.modalNavButton, right: '-50px' }}
                onClick={(e) => {
                  e.stopPropagation()
                  setModalIndex(modalIndex + 1)
                }}
                title="次の画像"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        </div>
      )}
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
  reportHeaderRow: { display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' },
  reportButton: { background: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: 'bold' },
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
  badgeHospital: { fontSize: '12px', alignSelf: 'flex-end', marginTop: '2px' },

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

  counterSection: { display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '18px' },
  counterItem: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' },
  counterLabel: { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '10px' },
  counterModeRow: { display: 'flex', gap: '8px', marginBottom: '12px' },
  counterModeButton: { flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', cursor: 'pointer' },
  counterControl: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  counterButton: { width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '24px', lineHeight: 1, cursor: 'pointer' },
  counterValue: { minWidth: '60px', textAlign: 'center', fontSize: '24px', fontWeight: 'bold', color: '#0f172a' },

  hospitalSection: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #f1f3f5' },
  hospitalFieldRow: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' },
  weightFieldWrap: { display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' },
  weightLabel: { fontSize: '13px', color: '#374151', fontWeight: '600' },
  weightInputWrap: { display: 'flex', alignItems: 'center', gap: '6px' },
  weightStepButton: { width: '38px', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '22px', lineHeight: 1, cursor: 'pointer', color: '#0f172a', padding: 0 },
  weightInput: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '120px', textAlign: 'center', fontSize: '18px', minHeight: '44px', height: '44px', boxSizing: 'border-box', MozAppearance: 'textfield', WebkitAppearance: 'auto' },
  weightUnit: { fontSize: '14px', color: '#374151', fontWeight: '600' },

  noteSection: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' },
  noteLabel: { fontSize: '14px', fontWeight: 'bold' },
  textarea: { padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', width: '100%', resize: 'vertical' },

  imageSection: { marginTop: '20px', borderTop: '1px solid #f1f3f5', paddingTop: '15px' },
  imageUploadArea: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' },
  fileUploadButton: { display: 'inline-block', padding: '6px 12px', background: '#28a745', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
  imageCountText: { fontSize: '13px', color: '#666' },
  errorText: { color: 'red', fontSize: '12px', marginTop: '4px' },
  imagePreviewContainer: { display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' },
  // スマホで押しやすくプレビューサイズを少し大きく調整 (80px -> 88px)
  imagePreviewWrapper: { position: 'relative', width: '88px', height: '88px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #ccc', cursor: 'pointer' },
  previewImage: { width: '100%', height: '100%', objectFit: 'cover' },
  zoomOverlay: { position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(0,0,0,0.5)', borderRadius: '3px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  // スマホでも押しやすいように削除ボタンを大きく変更（20px -> 30px、視認性の高い赤背景に変更）
  imageDeleteButton: { position: 'absolute', top: '4px', right: '4px', background: 'rgba(220, 53, 69, 0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, zIndex: 2, boxShadow: '0 2px 5px rgba(0,0,0,0.3)' },

  // モーダル用スタイル
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' },
  modalContent: { position: 'relative', maxWidth: '90%', maxHeight: '90%', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  modalImageContainer: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  modalImage: { maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '6px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' },
  modalCloseButton: { position: 'absolute', top: '-45px', right: '0', background: '#fff', color: '#333', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', zIndex: 10 },
  modalNavButton: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.8)', color: '#333', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', zIndex: 10 },
  modalPagination: { marginTop: '10px', color: '#fff', fontSize: '14px', background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: '12px' },

  errorContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8f9fa' },
  errorBox: { background: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '380px', textAlign: 'center' }
}