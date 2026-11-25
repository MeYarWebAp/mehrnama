

        let filePath = '';
        if (req.file) {
            filePath = '/uploads/' + req.file.filename;
        }

        const result = await pool.query(
            `INSERT INTO projects (title, charity_name, charity_id, province, district, description, file_path, views, likes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0) RETURNING *`,
            [title, charity_name, charity_id || 1, province, district || 'مرکزی', description, filePath]
        );
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// API ویرایش پروژه
app.put('/api/projects/:id', upload.single('media_file'), async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { id } = req.params;
        const { title, province, district, description } = req.body;
        
        let query = `UPDATE projects SET title = $1, province = $2, district = $3, description = $4`;
        let params = [title, province, district, description];

        if (req.file) {
            const filePath = '/uploads/' + req.file.filename;
            query += `, file_path = $5 WHERE id = $6 RETURNING *`;
            params.push(filePath, id);
        } else {
            query += ` WHERE id = $5 RETURNING *`;
            params.push(id);
        }

        const result = await pool.query(query, params);
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// API تعداد بازدید
app.post('/api/projects/:id/view', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const projectId = req.params.id;
        const result = await pool.query(
            'UPDATE projects SET views = COALESCE(views, 0) + 1 WHERE id = $1 RETURNING views',
            [projectId]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, views: result.rows[0].views });
        } else {
            res.status(404).json({ success: false, error: 'Not found' });
        }
    } catch (err) {
        next(err);
    }
});

// API لایک
app.post('/api/projects/:id/like', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const projectId = req.params.id;
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({ success: false, error: 'شناسه کاربر معتبر نیست.' });
        }

        const check = await pool.query(
            'SELECT * FROM project_likes WHERE user_id = $1 AND project_id = $2',
            [user_id, projectId]
        );

        let liked = false;
        let updateResult;

        if (check.rows.length > 0) {
            await pool.query('DELETE FROM project_likes WHERE user_id = $1 AND project_id = $2', [user_id, projectId]);
            updateResult = await pool.query(
                'UPDATE projects SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = $1 RETURNING likes',
                [projectId]
            );
            liked = false;
        } else {
            await pool.query('INSERT INTO project_likes (user_id, project_id) VALUES ($1, $2)', [user_id, projectId]);
            updateResult = await pool.query(
                'UPDATE projects SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING likes',
                [projectId]
            );
            liked = true;
        }

        res.json({
            success: true,
            liked: liked,
            likes: updateResult.rows[0].likes
        });
    } catch (err) {
        next(err);
    }
});

app.get('/api/projects/:id/user-liked', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const projectId = req.params.id;
        const userId = req.query.user_id;
        if (!userId) return res.json({ liked: false });

        const check = await pool.query(
            'SELECT * FROM project_likes WHERE user_id = $1 AND project_id = $2',
            [userId, projectId]
        );
        res.json({ liked: check.rows.length > 0 });
    } catch (err) {
        next(err);
    }
});

// API کامنت‌ها
app.get('/api/comments/:video_id', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { video_id } = req.params;
        const result = await pool.query('SELECT user_name as user, text FROM comments WHERE video_id = $1 ORDER BY id DESC', [video_id]);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

app.post('/api/comments', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { video_id, user_name, text } = req.body;
        await pool.query('INSERT INTO comments (video_id, user_name, text) VALUES ($1, $2, $3)', [video_id, user_name, text]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// API اشتراک‌ها
app.get('/api/subscriptions/:user_id', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { user_id } = req.params;
        const result = await pool.query('SELECT charity_id as id, charity_name as name FROM subscriptions WHERE user_id = $1', [user_id]);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

app.post('/api/subscriptions/toggle', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { user_id, charity_id, charity_name } = req.body;
        const check = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1 AND charity_id = $2', [user_id, charity_id]);
        if (check.rows.length > 0) {
            await pool.query('DELETE FROM subscriptions WHERE user_id = $1 AND charity_id = $2', [user_id, charity_id]);
            res.json({ success: true, subscribed: false });
        } else {
            await pool.query('INSERT INTO subscriptions (user_id, charity_id, charity_name) VALUES ($1, $2, $3)', [user_id, charity_id, charity_name]);
            res.json({ success: true, subscribed: true });
        }
    } catch (err) {
        next(err);
    }
});

app.use((err, req, res, next) => {
    console.error('Server Error Detail:', err.message);
    res.status(500).json({
        success: false,
        error: err.message || 'خطای داخلی سرور'
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
